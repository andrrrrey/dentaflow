"""Celery tasks for synchronising data with 1Denta CRM.

Both tasks run every 15 minutes via Celery Beat.  They call the
``OneDentaService``, upsert records into the local database and log
results.  Errors are caught so the scheduler keeps running.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


from app.tasks.loop import run_async as _run_async  # noqa: E402


async def _sync_patients_async() -> dict:
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.patient import Patient
    from app.services.one_denta import OneDentaService

    service = await OneDentaService.from_db_session_factory()
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    patients_data = await service.get_patients(updated_since=since)

    created = 0
    updated = 0

    # Batch-fetch all existing patients by external_id (single query instead of N+1)
    all_ext_ids = [p["external_id"] for p in patients_data if p.get("external_id")]
    if not all_ext_ids:
        return {"created": 0, "updated": 0, "total": 0}

    async with async_session_factory() as session:
        existing_rows = (await session.execute(
            select(Patient).where(Patient.external_id.in_(all_ext_ids))
        )).scalars().all()
        existing_map = {p.external_id: p for p in existing_rows}

        now_utc = datetime.now(timezone.utc)

        for p_data in patients_data:
            ext_id = p_data.get("external_id")
            if not ext_id:
                continue

            sex_val = p_data.get("sex", 0)
            gender_val = "female" if sex_val == 2 else ("male" if sex_val == 1 else None)
            patient_type_val = p_data.get("type")

            patient = existing_map.get(ext_id)
            if patient is None:
                patient = Patient(
                    external_id=ext_id,
                    name=p_data.get("name", ""),
                    phone=p_data.get("phone"),
                    email=p_data.get("email"),
                    is_new_patient=p_data.get("is_new_patient", True),
                    total_revenue=p_data.get("total_revenue", 0),
                    tags=p_data.get("tags"),
                    gender=gender_val,
                    patient_type=patient_type_val,
                    raw_1denta_data=p_data,
                    synced_at=now_utc,
                )
                if p_data.get("birth_date"):
                    from app.services.one_denta import parse_birthdate
                    bd = parse_birthdate(p_data["birth_date"])
                    if bd is not None:
                        patient.birth_date = bd
                if p_data.get("last_visit_at"):
                    try:
                        patient.last_visit_at = datetime.fromisoformat(
                            p_data["last_visit_at"]
                        )
                    except ValueError:
                        pass
                session.add(patient)
                created += 1
            else:
                patient.name = p_data.get("name", patient.name)
                patient.phone = p_data.get("phone", patient.phone)
                patient.email = p_data.get("email", patient.email)
                patient.is_new_patient = p_data.get("is_new_patient", patient.is_new_patient)
                patient.total_revenue = p_data.get("total_revenue", patient.total_revenue)
                patient.tags = p_data.get("tags", patient.tags)
                patient.gender = gender_val or patient.gender
                patient.patient_type = patient_type_val or patient.patient_type
                patient.raw_1denta_data = p_data
                patient.synced_at = now_utc
                if not patient.birth_date and p_data.get("birth_date"):
                    from app.services.one_denta import parse_birthdate
                    bd = parse_birthdate(p_data["birth_date"])
                    if bd is not None:
                        patient.birth_date = bd
                if p_data.get("last_visit_at"):
                    try:
                        patient.last_visit_at = datetime.fromisoformat(
                            p_data["last_visit_at"]
                        )
                    except ValueError:
                        pass
                updated += 1

        await session.commit()

    return {"created": created, "updated": updated, "total": len(patients_data)}


async def _sync_appointments_async(
    days_back: int = 7,
    days_forward: int = 21,
) -> dict:
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.services.one_denta import OneDentaService

    service = await OneDentaService.from_db_session_factory()
    now = datetime.now(timezone.utc)
    appointments_data = await service.get_appointments(
        date_from=now - timedelta(days=days_back),
        date_to=now + timedelta(days=days_forward),
    )

    created = 0
    updated = 0

    valid = [(a, a["external_id"]) for a in appointments_data if a.get("external_id")]
    if not valid:
        return {"created": 0, "updated": 0, "total": 0}

    ext_ids = [ext_id for _, ext_id in valid]
    patient_ext_ids = list({a.get("patient_external_id") for a, _ in valid if a.get("patient_external_id")})

    async with async_session_factory() as session:
        # Batch-fetch existing appointments
        existing_rows = (await session.execute(
            select(Appointment).where(Appointment.external_id.in_(ext_ids))
        )).scalars().all()
        existing_map = {a.external_id: a for a in existing_rows}

        # Batch-fetch patients
        patient_rows = (await session.execute(
            select(Patient.id, Patient.external_id).where(
                Patient.external_id.in_(patient_ext_ids)
            )
        )).all() if patient_ext_ids else []
        patient_map = {row.external_id: row.id for row in patient_rows}

        now_utc = datetime.now(timezone.utc)

        for a_data, ext_id in valid:
            patient_id = patient_map.get(a_data.get("patient_external_id"))

            scheduled_at = None
            if a_data.get("scheduled_at"):
                try:
                    dt = datetime.fromisoformat(a_data["scheduled_at"])
                    # 1denta returns Moscow local time (naive or +03:00).
                    # Strip tzinfo so asyncpg stores the value as-is in UTC column;
                    # the frontend treats it as Moscow local time for display.
                    scheduled_at = dt.replace(tzinfo=None) if dt.tzinfo else dt
                except ValueError:
                    pass

            appointment = existing_map.get(ext_id)
            if appointment is None:
                appointment = Appointment(
                    external_id=ext_id,
                    patient_id=patient_id,
                    doctor_name=a_data.get("doctor_name"),
                    doctor_id=a_data.get("doctor_id"),
                    service=a_data.get("service"),
                    branch=a_data.get("branch"),
                    scheduled_at=scheduled_at,
                    duration_min=a_data.get("duration_min") or 30,
                    status=a_data.get("status"),
                    revenue=a_data.get("revenue"),
                    discount=a_data.get("discount"),
                    payment_amount=a_data.get("payment_amount"),
                    services_data=a_data.get("services_data"),
                    comment=a_data.get("comment"),
                    synced_at=now_utc,
                )
                session.add(appointment)
                created += 1
            else:
                appointment.patient_id = patient_id or appointment.patient_id
                # Only update fields when the incoming value is non-empty so that
                # a temporary resource_map miss can't erase a previously correct name.
                if a_data.get("doctor_name"):
                    appointment.doctor_name = a_data["doctor_name"]
                if a_data.get("doctor_id"):
                    appointment.doctor_id = a_data["doctor_id"]
                appointment.service = a_data.get("service") or appointment.service
                appointment.branch = a_data.get("branch", appointment.branch)
                appointment.scheduled_at = scheduled_at or appointment.scheduled_at
                new_dur = a_data.get("duration_min")
                if new_dur:
                    appointment.duration_min = new_dur
                appointment.status = a_data.get("status", appointment.status)
                appointment.revenue = a_data.get("revenue", appointment.revenue)
                appointment.discount = a_data.get("discount", appointment.discount)
                # Only overwrite payment_amount from 1Denta if it was never set manually
                if appointment.payment_amount is None:
                    appointment.payment_amount = a_data.get("payment_amount")
                appointment.services_data = a_data.get("services_data", appointment.services_data)
                appointment.comment = a_data.get("comment", appointment.comment)
                appointment.synced_at = now_utc
                updated += 1

        await session.commit()

    # Backfill doctor_name for appointments that still have empty name.
    # Runs after commit so new appointments are visible.
    await _backfill_doctor_names_async()

    # Auto-create waiting_list deals disabled — deals are created manually via Communications
    # await _sync_waiting_list_deals_async(appointments_data)

    return {"created": created, "updated": updated, "total": len(appointments_data)}


async def _backfill_doctor_names_async() -> None:
    """Fill doctor_name on appointments that have doctor_id but empty name,
    using directory_cache as the source of truth."""
    from sqlalchemy import select, update
    from app.database import async_session_factory
    from app.models.directory_cache import DirectoryCache
    from app.models.appointment import Appointment

    async with async_session_factory() as session:
        resource_rows = (await session.execute(
            select(DirectoryCache.external_id, DirectoryCache.name)
            .where(DirectoryCache.category == "resource", DirectoryCache.name != "")
        )).all()

        if not resource_rows:
            return

        for ext_id, name in resource_rows:
            await session.execute(
                update(Appointment)
                .where(
                    Appointment.doctor_id == ext_id,
                    (Appointment.doctor_name == None) | (Appointment.doctor_name == ""),
                )
                .values(doctor_name=name)
            )
        await session.commit()


async def _sync_waiting_list_deals_async(appointments_data: list) -> None:
    """Create waiting_list pipeline deals for newly scheduled 1denta appointments."""
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.deal import Deal
    from app.models.patient import Patient

    eligible_statuses = {"scheduled", "confirmed", "waiting"}

    eligible = [
        a for a in appointments_data
        if a.get("status") in eligible_statuses and a.get("patient_external_id")
    ]
    if not eligible:
        return

    patient_ext_ids = list({a["patient_external_id"] for a in eligible})

    async with async_session_factory() as session:
        # Batch-fetch all relevant patients in one query
        p_rows = (await session.execute(
            select(Patient.id, Patient.external_id).where(
                Patient.external_id.in_(patient_ext_ids)
            )
        )).all()
        ext_to_patient_id = {row.external_id: row.id for row in p_rows}

        if not ext_to_patient_id:
            return

        patient_ids = list(ext_to_patient_id.values())

        # Batch-fetch patients that already have an open deal
        rows_with_deals = (await session.execute(
            select(Deal.patient_id).where(
                Deal.patient_id.in_(patient_ids),
                Deal.stage.notin_(["closed_won", "closed_lost"]),
            ).distinct()
        )).scalars().all()
        patients_with_open_deals = set(rows_with_deals)

        for a_data in eligible:
            patient_id = ext_to_patient_id.get(a_data["patient_external_id"])
            if not patient_id or patient_id in patients_with_open_deals:
                continue

            patient_name = a_data.get("patient_name") or ""
            session.add(Deal(
                title=f"Запись: {patient_name} — {a_data.get('service', 'Услуга')}",
                patient_id=patient_id,
                stage="waiting_list",
                source_channel="1denta",
                service=a_data.get("service"),
                doctor_name=a_data.get("doctor_name"),
            ))
            # Mark so we don't create duplicate deals within the same batch
            patients_with_open_deals.add(patient_id)

        await session.commit()


@celery_app.task(name="app.tasks.sync_1denta.sync_patients", bind=True, max_retries=3)
def sync_patients(self):
    """Sync patients from 1Denta CRM."""
    try:
        result = _run_async(_sync_patients_async())
        logger.info(
            "sync_patients complete: created=%d updated=%d total=%d",
            result["created"],
            result["updated"],
            result["total"],
        )
        return result
    except Exception as exc:
        logger.exception("sync_patients failed")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.sync_1denta.sync_appointments", bind=True, max_retries=3)
def sync_appointments(self):
    """Frequent background sync: appointments for the next 14 days."""
    try:
        result = _run_async(_sync_appointments_async(days_back=3, days_forward=14))
        logger.info(
            "sync_appointments complete: created=%d updated=%d total=%d",
            result["created"],
            result["updated"],
            result["total"],
        )
        return result
    except Exception as exc:
        logger.exception("sync_appointments failed")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.sync_1denta.backfill_appointments", bind=True, max_retries=2)
def backfill_appointments(self, years_back: int = 5):
    """One-off deep history backfill of appointments from 1Denta.

    The regular syncs only cover a ±30/+90 day window, so before the first
    AI segment run we need the full visit history per patient for the
    treatment-completion analysis to be accurate. Run manually:
        celery -A app.tasks.celery_app call app.tasks.sync_1denta.backfill_appointments
    """
    try:
        result = _run_async(
            _sync_appointments_async(days_back=years_back * 365, days_forward=90)
        )
        logger.info(
            "backfill_appointments complete: created=%d updated=%d total=%d",
            result["created"],
            result["updated"],
            result["total"],
        )
        return result
    except Exception as exc:
        logger.exception("backfill_appointments failed")
        raise self.retry(exc=exc, countdown=300)


async def _sync_calls_async(days: int = 7) -> dict:
    """Import call history from Novofon into Communications (Контроль звонков)."""
    import json as _json
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.communication import Communication
    from app.routers.calls import _map_stat_to_comm
    from app.services.integrations_service import get_raw_value
    from app.services.novofon import NovofonService

    async with async_session_factory() as session:
        api_key = await get_raw_value(session, "novofon_api_key")
        api_secret = await get_raw_value(session, "novofon_webhook_secret")

        if not api_key:
            return {"synced": 0, "updated": 0, "skipped": 0, "message": "Novofon API key not configured"}

        svc = NovofonService(api_key=api_key, api_secret=api_secret or None)
        date_from = datetime.now(timezone.utc) - timedelta(days=days)

        try:
            stats = await svc.get_call_history(date_from=date_from)
        except Exception:
            logger.exception("sync_calls: Novofon API error")
            return {"synced": 0, "updated": 0, "skipped": 0, "error": "novofon_api_error"}

        if not stats:
            return {"synced": 0, "updated": 0, "skipped": 0, "total_from_api": 0}

        all_ext_ids = [
            str(s.get("call_id") or s.get("pbx_call_id") or "")
            for s in stats if s.get("call_id") or s.get("pbx_call_id")
        ]
        existing_result = await session.execute(
            select(Communication).where(
                Communication.channel == "novofon",
                Communication.external_id.in_(all_ext_ids),
            )
        )
        existing_by_ext_id: dict[str, list[Communication]] = {}
        for c in existing_result.scalars().all():
            existing_by_ext_id.setdefault(c.external_id, []).append(c)

        synced = 0
        updated = 0
        skipped = 0
        for stat in stats:
            mapped = _map_stat_to_comm(stat)
            if not mapped:
                skipped += 1
                continue

            content = _json.dumps(
                {"caller_id": mapped["caller_id"], "called_did": mapped["called_did"]},
                ensure_ascii=False,
            )
            ext_id = mapped["external_id"]

            if ext_id in existing_by_ext_id:
                for comm in existing_by_ext_id[ext_id]:
                    comm.content = content
                    comm.type = mapped["comm_type"]
                    comm.direction = mapped["direction"]
                    comm.duration_sec = mapped["duration_sec"]
                    comm.priority = "high" if mapped["comm_type"] == "missed_call" else "normal"
                    if mapped["created_at"]:
                        comm.created_at = mapped["created_at"]
                updated += 1
                continue

            comm = Communication(
                channel="novofon",
                direction=mapped["direction"],
                type=mapped["comm_type"],
                content=content,
                duration_sec=mapped["duration_sec"],
                status="new",
                priority="high" if mapped["comm_type"] == "missed_call" else "normal",
                external_id=ext_id,
            )
            if mapped["created_at"]:
                comm.created_at = mapped["created_at"]
            session.add(comm)
            synced += 1

        if synced or updated:
            await session.commit()

    return {"synced": synced, "updated": updated, "skipped": skipped, "total_from_api": len(stats)}


async def _sync_marketing_async() -> dict:
    """Import discounts and gift certificates from 1Denta (Маркетинг)."""
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.discount import Discount
    from app.models.gift_certificate import GiftCertificate
    from app.services.one_denta import OneDentaService

    synced_certs = 0
    synced_discounts = 0

    async with async_session_factory() as session:
        try:
            svc = await OneDentaService.from_db(session)
        except Exception:
            return {"synced_certificates": 0, "synced_discounts": 0, "message": "1Denta not configured"}

        if svc._no_credentials():
            return {"synced_certificates": 0, "synced_discounts": 0, "message": "1Denta credentials not configured"}

        now = datetime.now(timezone.utc)
        existing_codes = {row[0] for row in (await session.execute(select(GiftCertificate.code))).all()}
        existing_discount_names = {row[0] for row in (await session.execute(select(Discount.name))).all()}

        try:
            for d in await svc.get_discounts():
                name = (d.get("name") or d.get("title") or "").strip()
                if not name or name in existing_discount_names:
                    continue
                value_raw = d.get("value") or d.get("percent") or d.get("amount") or d.get("size") or 0
                try:
                    value = float(value_raw)
                except (TypeError, ValueError):
                    value = 0.0
                session.add(Discount(
                    name=name,
                    type="percent" if value <= 100 else "fixed",
                    value=value,
                    is_active=bool(d.get("active", d.get("isActive", True))),
                    description=f"Импорт из 1Denta (ID: {d.get('id', '')})",
                ))
                existing_discount_names.add(name)
                synced_discounts += 1
        except Exception as e:
            logger.warning("sync_marketing: failed to fetch discounts: %s", e)

        try:
            for c in await svc.get_certificates():
                cert_id = str(c.get("id", ""))
                code = f"1D-CERT-{cert_id}" if cert_id else None
                if not code or code in existing_codes:
                    continue
                amount_raw = c.get("amount") or c.get("nominal") or c.get("value") or c.get("sum") or 0
                try:
                    amount = float(amount_raw)
                except (TypeError, ValueError):
                    amount = 0.0
                session.add(GiftCertificate(
                    code=code,
                    amount=amount,
                    remaining_amount=float(c.get("remaining") or c.get("remainingAmount") or amount),
                    recipient_name=c.get("clientName") or c.get("name") or c.get("recipient") or None,
                    valid_from=now.date(),
                    valid_to=(now + timedelta(days=365)).date(),
                    note=f"Импорт из 1Denta (ID: {cert_id})",
                    status="active",
                ))
                existing_codes.add(code)
                synced_certs += 1
        except Exception as e:
            logger.warning("sync_marketing: failed to fetch certificates: %s", e)

        await session.commit()

    return {"synced_certificates": synced_certs, "synced_discounts": synced_discounts}


@celery_app.task(name="app.tasks.sync_1denta.sync_calls", bind=True, max_retries=3)
def sync_calls(self):
    """Import recent call history from Novofon (Контроль звонков)."""
    try:
        result = _run_async(_sync_calls_async(days=7))
        logger.info("sync_calls complete: %s", result)
        return result
    except Exception as exc:
        logger.exception("sync_calls failed")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.sync_1denta.sync_marketing", bind=True, max_retries=3)
def sync_marketing(self):
    """Import discounts and certificates from 1Denta (Маркетинг)."""
    try:
        result = _run_async(_sync_marketing_async())
        logger.info("sync_marketing complete: %s", result)
        return result
    except Exception as exc:
        logger.exception("sync_marketing failed")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.sync_1denta.sync_full_daily", bind=True, max_retries=2)
def sync_full_daily(self):
    """Nightly full sync with 1Denta and Novofon across all sections:
    Справочники, Пациенты, Расписание, Контроль звонков, Маркетинг."""
    try:
        dir_result = _run_async(_sync_directories_async())
        pat_result = _run_async(_sync_patients_async())
        appt_result = _run_async(_sync_appointments_async(days_back=30, days_forward=90))
        calls_result = _run_async(_sync_calls_async(days=30))
        marketing_result = _run_async(_sync_marketing_async())
        logger.info(
            "sync_full_daily complete: dirs=%s patients=%s appointments=%s calls=%s marketing=%s",
            dir_result, pat_result, appt_result, calls_result, marketing_result,
        )
        return {
            "directories": dir_result,
            "patients": pat_result,
            "appointments": appt_result,
            "calls": calls_result,
            "marketing": marketing_result,
        }
    except Exception as exc:
        logger.exception("sync_full_daily failed")
        raise self.retry(exc=exc, countdown=300)


async def _sync_directories_async() -> dict:
    """Sync services, resources (doctors) and commodities into directory_cache,
    then backfill doctor_name on existing appointments."""
    from sqlalchemy import select, delete, update
    from app.database import async_session_factory
    from app.models.directory_cache import DirectoryCache
    from app.models.appointment import Appointment
    from app.services.one_denta import OneDentaService

    service = await OneDentaService.from_db_session_factory()
    counts: dict[str, int] = {}

    async with async_session_factory() as session:
        now = datetime.now(timezone.utc)

        def _item_name(category: str, item: dict) -> str:
            if category == "service":
                return item.get("name", item.get("title", ""))
            if category == "resource":
                return item.get("title", item.get("name", ""))
            return item.get("title", item.get("name", ""))

        def _normalize_for_cache(category: str, item: dict) -> dict:
            """Normalize raw 1Denta item before storing in directory_cache."""
            from app.routers.directories import _normalize_service, _normalize_resource, _normalize_commodity
            if category == "service":
                return _normalize_service(item)
            if category == "resource":
                return _normalize_resource(item)
            if category == "commodity":
                return _normalize_commodity(item)
            return item

        for category, fetch_coro in [
            ("service", service.get_services()),
            ("resource", service.get_resources()),
        ]:
            try:
                items = await fetch_coro
                await session.execute(
                    delete(DirectoryCache).where(DirectoryCache.category == category)
                )
                for item in items:
                    normalized = _normalize_for_cache(category, item)
                    session.add(DirectoryCache(
                        external_id=str(item.get("id", "")),
                        category=category,
                        name=_item_name(category, normalized),
                        data=normalized,
                        synced_at=now,
                    ))
                counts[category] = len(items)
                logger.info("sync_directories: %s=%d", category, len(items))
            except Exception:
                logger.exception("sync_directories: failed to sync %s", category)

        # Backfill doctor_name on appointments that have doctor_id but no name
        resource_rows = (await session.execute(
            select(DirectoryCache.external_id, DirectoryCache.name)
            .where(DirectoryCache.category == "resource",
                   DirectoryCache.name != "")
        )).all()
        for ext_id, name in resource_rows:
            await session.execute(
                update(Appointment)
                .where(
                    Appointment.doctor_id == ext_id,
                    (Appointment.doctor_name == None) | (Appointment.doctor_name == ""),
                )
                .values(doctor_name=name)
            )

        await session.commit()

    return counts


@celery_app.task(name="app.tasks.sync_1denta.sync_directories", bind=True, max_retries=3)
def sync_directories(self):
    """Sync reference data (doctors, services) from 1Denta and fix doctor names."""
    try:
        result = _run_async(_sync_directories_async())
        logger.info("sync_directories complete: %s", result)
        return result
    except Exception as exc:
        logger.exception("sync_directories failed")
        raise self.retry(exc=exc, countdown=60)
