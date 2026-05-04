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


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


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

    async with async_session_factory() as session:
        for p_data in patients_data:
            ext_id = p_data.get("external_id")
            if not ext_id:
                continue

            stmt = select(Patient).where(Patient.external_id == ext_id).limit(1)
            result = await session.execute(stmt)
            patient = result.scalar_one_or_none()

            sex_val = p_data.get("sex", 0)
            gender_val = "female" if sex_val == 2 else ("male" if sex_val == 1 else None)
            patient_type_val = p_data.get("type")

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
                    synced_at=datetime.now(timezone.utc),
                )
                if p_data.get("birth_date"):
                    try:
                        patient.birth_date = datetime.strptime(
                            p_data["birth_date"], "%Y-%m-%d"
                        ).date()
                    except ValueError:
                        pass
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
                patient.synced_at = datetime.now(timezone.utc)
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


async def _sync_appointments_async() -> dict:
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.services.one_denta import OneDentaService

    service = await OneDentaService.from_db_session_factory()
    now = datetime.now(timezone.utc)
    # Sync only recent window: past 30 days + next 90 days (not 5 years of history)
    appointments_data = await service.get_appointments(
        date_from=now - timedelta(days=30),
        date_to=now + timedelta(days=90),
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
                    # Store naive datetimes as-is; 1denta returns Moscow local time
                    # and we display it without timezone conversion on the frontend
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
                    duration_min=a_data.get("duration_min", 30),
                    status=a_data.get("status"),
                    revenue=a_data.get("revenue"),
                    comment=a_data.get("comment"),
                    synced_at=now_utc,
                )
                session.add(appointment)
                created += 1
            else:
                appointment.patient_id = patient_id or appointment.patient_id
                appointment.doctor_name = a_data.get("doctor_name") or appointment.doctor_name
                appointment.doctor_id = a_data.get("doctor_id") or appointment.doctor_id
                appointment.service = a_data.get("service") or appointment.service
                appointment.branch = a_data.get("branch", appointment.branch)
                appointment.scheduled_at = scheduled_at or appointment.scheduled_at
                appointment.duration_min = a_data.get("duration_min", appointment.duration_min)
                appointment.status = a_data.get("status", appointment.status)
                appointment.revenue = a_data.get("revenue", appointment.revenue)
                appointment.comment = a_data.get("comment", appointment.comment)
                appointment.synced_at = now_utc
                updated += 1

        await session.commit()

    # Auto-create waiting_list deals for scheduled/confirmed appointments without a deal
    await _sync_waiting_list_deals_async(appointments_data)

    return {"created": created, "updated": updated, "total": len(appointments_data)}


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
    """Sync appointments from 1Denta CRM."""
    try:
        result = _run_async(_sync_appointments_async())
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
