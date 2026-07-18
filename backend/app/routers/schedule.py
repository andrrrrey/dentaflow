"""Schedule / appointments router.

Returns appointments from the local DB (synced from 1Denta every 5 minutes).
Supports filtering by date, doctor and status.
Also allows creating new appointments via 1Denta API.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User
from app.services.one_denta import OneDentaService

router = APIRouter(prefix="/api/v1/schedule", tags=["schedule"])


@router.get("/")
async def list_schedule(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    doctor: str | None = Query(None, description="Filter by doctor name (partial match)"),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return appointments for the given date range."""
    if date_from is None:
        date_from = date.today()
    if date_to is None:
        date_to = date_from + timedelta(days=7)

    dt_from = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
    dt_to = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)

    stmt = (
        select(
            Appointment,
            Patient.name.label("patient_name"),
            Patient.phone.label("patient_phone"),
            Patient.birth_date.label("patient_birth_date"),
            Patient.patient_type.label("patient_type"),
            Patient.raw_1denta_data.label("patient_raw"),
        )
        .outerjoin(Patient, Appointment.patient_id == Patient.id)
        .where(Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to)
        .order_by(Appointment.scheduled_at)
    )

    if doctor:
        stmt = stmt.where(Appointment.doctor_name.ilike(f"%{doctor}%"))
    if status:
        stmt = stmt.where(Appointment.status == status)

    result = await db.execute(stmt)
    rows = result.all()

    from app.services.one_denta import parse_birthdate

    appointments = []
    for row in rows:
        appt = row.Appointment
        # Prefer the dedicated column; fall back to the raw 1Denta birthDate
        # (DD.MM.YYYY) for patients whose column hasn't been backfilled yet.
        bd = row.patient_birth_date
        if bd is None and isinstance(row.patient_raw, dict):
            bd = parse_birthdate(row.patient_raw.get("birth_date") or row.patient_raw.get("birthDate"))
        appointments.append({
            "id": str(appt.id),
            "external_id": appt.external_id,
            "patient_id": str(appt.patient_id) if appt.patient_id else None,
            "patient_name": row.patient_name or "Неизвестный пациент",
            "patient_phone": row.patient_phone,
            "patient_birth_date": bd.isoformat() if bd else None,
            # «Первичный» пациент — 1Denta client type == "new"
            "is_primary": row.patient_type == "new",
            "doctor_name": appt.doctor_name,
            "doctor_id": appt.doctor_id,
            "service": appt.service,
            "branch": appt.branch,
            "scheduled_at": appt.scheduled_at.strftime("%Y-%m-%dT%H:%M:%S") if appt.scheduled_at else None,
            "duration_min": appt.duration_min,
            "status": appt.status,
            "comment": appt.comment,
            "revenue": float(appt.revenue) if appt.revenue else 0,
        })

    total = len(appointments)
    confirmed = sum(1 for a in appointments if a["status"] == "confirmed")
    cancelled = sum(1 for a in appointments if a["status"] == "cancelled")

    return {
        "appointments": appointments,
        "stats": {
            "total": total,
            "confirmed": confirmed,
            "cancelled": cancelled,
            "completion_rate": round(confirmed / total * 100) if total else 0,
        },
    }


def _derive_breaks(busy: list[tuple[int, int]], free_starts: list[int]) -> list[tuple[int, int]]:
    """Перерывы = «дыры» между активными интервалами дня врача.

    API 1Denta не отдаёт перерывы как сущность. Восстанавливаем их косвенно:
    активное время = записи (busy) + свободные онлайн-слоты (free_starts);
    промежуток внутри дня, где нет ни того ни другого, — перерыв/блокировка.
    Края дня (до первой и после последней активности) перерывом не считаются.
    """
    step = 15
    fs = sorted(set(free_starts))
    if len(fs) >= 2:
        diffs = [b - a for a, b in zip(fs, fs[1:]) if b - a > 0]
        if diffs:
            step = min(min(diffs), 60)

    covered = [(s, s + step) for s in fs] + [iv for iv in busy if iv[1] > iv[0]]
    if len(covered) < 2:
        return []
    covered.sort()
    merged: list[tuple[int, int]] = []
    for s, e in covered:
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return [
        (e1, s2)
        for (_, e1), (s2, _) in zip(merged, merged[1:])
        if s2 - e1 >= 15
    ]


@router.get("/breaks")
async def list_breaks(
    day: date = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Перерывы врачей на день, выведенные из свободных слотов онлайн-записи.

    Слоты берутся из Redis-кэша (общий с синком, TTL 30 мин) либо запрашиваются
    у 1Denta. Врачи без онлайн-записи пропускаются — для них данных нет.
    """
    import json as _json

    from app.models.directory_cache import DirectoryCache
    from app.services.one_denta import _redis_client

    dt_from = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    dt_to = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)
    rows = (await db.execute(
        select(Appointment.doctor_id, Appointment.scheduled_at, Appointment.duration_min)
        .where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Appointment.doctor_id.isnot(None),
            Appointment.doctor_id != "",
            Appointment.status.notin_(["cancelled", "no_show"]),
        )
    )).all()

    busy_by_doc: dict[str, list[tuple[int, int]]] = {}
    for r in rows:
        if not r.scheduled_at:
            continue
        start_min = r.scheduled_at.hour * 60 + r.scheduled_at.minute
        busy_by_doc.setdefault(r.doctor_id, []).append(
            (start_min, start_min + (r.duration_min or 30))
        )
    if not busy_by_doc:
        return {"breaks": []}

    cache_rows = (await db.execute(
        select(DirectoryCache).where(DirectoryCache.category.in_(["resource", "service"]))
    )).scalars().all()
    online_resource_ids = {
        r.external_id for r in cache_rows
        if r.category == "resource" and not (r.data or {}).get("_placeholder")
    }
    probe_service_id = next(
        (r.external_id for r in cache_rows
         if r.category == "service" and (r.data or {}).get("onlineRecord")),
        None,
    )
    if not probe_service_id:
        return {"breaks": []}

    svc = None
    r_client = await _redis_client()
    breaks: list[dict] = []
    try:
        for doc_id, busy in busy_by_doc.items():
            if doc_id not in online_resource_ids:
                continue
            key = f"1denta:slots:{doc_id}:{day.isoformat()}"
            minutes: list[int] | None = None
            if r_client is not None:
                try:
                    cached = await r_client.get(key)
                    if cached is not None:
                        minutes = _json.loads(cached)
                except Exception:
                    minutes = None
            if minutes is None:
                minutes = []
                try:
                    if svc is None:
                        svc = await OneDentaService.from_db(db)
                    slots = await svc.get_available_slots(
                        resource_id=doc_id, service_ids=[probe_service_id], date=day.isoformat()
                    )
                    for s in slots:
                        try:
                            sdt = datetime.fromisoformat(s)
                            minutes.append(sdt.hour * 60 + sdt.minute)
                        except ValueError:
                            pass
                except Exception:
                    logger.warning("breaks: failed to load slots for %s @ %s", doc_id, day)
                if r_client is not None:
                    try:
                        await r_client.setex(key, 1800, _json.dumps(minutes))
                    except Exception:
                        pass
            for start_min, end_min in _derive_breaks(busy, minutes):
                breaks.append({"doctor_id": doc_id, "start_min": start_min, "end_min": end_min})
    finally:
        if r_client is not None:
            try:
                await r_client.aclose()
            except Exception:
                pass

    return {"breaks": breaks}


@router.get("/{appointment_id}")
async def get_appointment_detail(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return full appointment detail with patient info."""
    stmt = (
        select(Appointment, Patient)
        .outerjoin(Patient, Appointment.patient_id == Patient.id)
        .where(Appointment.id == appointment_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt, patient = row.Appointment, row.Patient
    response: dict = {
        "appointment": {
            "id": str(appt.id),
            "external_id": appt.external_id,
            "doctor_name": appt.doctor_name,
            "doctor_id": appt.doctor_id,
            "service": appt.service,
            "branch": appt.branch,
            "scheduled_at": appt.scheduled_at.strftime("%Y-%m-%dT%H:%M:%S") if appt.scheduled_at else None,
            "duration_min": appt.duration_min,
            "status": appt.status,
            "comment": appt.comment,
            "revenue": float(appt.revenue) if appt.revenue else 0,
            "discount": float(appt.discount) if appt.discount is not None else None,
            "payment_amount": float(appt.payment_amount) if appt.payment_amount is not None else None,
            "services_data": appt.services_data,
        },
        "patient": None,
    }
    if patient:
        from app.services.one_denta import parse_birthdate
        bd = patient.birth_date
        if bd is None and isinstance(patient.raw_1denta_data, dict):
            bd = parse_birthdate(
                patient.raw_1denta_data.get("birth_date")
                or patient.raw_1denta_data.get("birthDate")
            )
        response["patient"] = {
            "id": str(patient.id),
            "external_id": patient.external_id,
            "name": patient.name,
            "phone": patient.phone,
            "email": patient.email,
            "birth_date": bd.isoformat() if bd else None,
            "source_channel": patient.source_channel,
            "is_new_patient": patient.is_new_patient,
            "last_visit_at": patient.last_visit_at.strftime("%Y-%m-%dT%H:%M:%S") if patient.last_visit_at else None,
            "total_revenue": float(patient.total_revenue),
            "ltv_score": patient.ltv_score,
            "tags": patient.tags,
            "representative_name": patient.representative_name,
            "representative_phone": patient.representative_phone,
            "representative_relation": patient.representative_relation,
            "raw_1denta_data": patient.raw_1denta_data,
        }
    return response


class UpdateAppointmentBody(BaseModel):
    service: str | None = None
    doctor_name: str | None = None
    doctor_id: str | None = None
    comment: str | None = None
    scheduled_at: datetime | None = None


@router.patch("/{appointment_id}")
async def update_appointment(
    appointment_id: uuid.UUID,
    body: UpdateAppointmentBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Update appointment service, doctor or comment."""
    stmt = select(Appointment).where(Appointment.id == appointment_id)
    result = await db.execute(stmt)
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if body.service is not None:
        appt.service = body.service
    if body.doctor_name is not None:
        appt.doctor_name = body.doctor_name
    if body.doctor_id is not None:
        appt.doctor_id = body.doctor_id
    if body.comment is not None:
        appt.comment = body.comment
    if body.scheduled_at is not None:
        # scheduled_at is stored as naive wall-clock time (matching the create path),
        # so drop any tzinfo without shifting the clock value.
        new_dt = body.scheduled_at
        if new_dt.tzinfo is not None:
            new_dt = new_dt.replace(tzinfo=None)
        appt.scheduled_at = new_dt

    await db.commit()

    is_remote = bool(appt.external_id) and not appt.external_id.startswith("local-")

    # Sync comment back to 1Denta if applicable
    if body.comment is not None and is_remote:
        try:
            svc = await OneDentaService.from_db(db)
            await svc.update_visit(appt.external_id, comment=body.comment)
        except Exception:
            pass  # best-effort

    # Sync new date/time back to 1Denta if applicable
    if body.scheduled_at is not None and is_remote:
        try:
            svc = await OneDentaService.from_db(db)
            await svc.update_visit(appt.external_id, dt=appt.scheduled_at.isoformat())
        except Exception:
            pass  # best-effort

    return {
        "id": str(appt.id),
        "service": appt.service,
        "doctor_name": appt.doctor_name,
        "doctor_id": appt.doctor_id,
        "comment": appt.comment,
        "scheduled_at": appt.scheduled_at.strftime("%Y-%m-%dT%H:%M:%S") if appt.scheduled_at else None,
    }


class UpdatePaymentBody(BaseModel):
    discount: float | None = None
    payment_amount: float | None = None


@router.patch("/{appointment_id}/payment")
async def update_appointment_payment(
    appointment_id: uuid.UUID,
    body: UpdatePaymentBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Save discount and payment amount locally (1Denta API does not support writing these)."""
    stmt = select(Appointment).where(Appointment.id == appointment_id)
    result = await db.execute(stmt)
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if body.discount is not None:
        appt.discount = body.discount
    if body.payment_amount is not None:
        appt.payment_amount = body.payment_amount

    await db.commit()
    return {
        "id": str(appt.id),
        "discount": float(appt.discount) if appt.discount is not None else None,
        "payment_amount": float(appt.payment_amount) if appt.payment_amount is not None else None,
    }


class UpdateAppointmentStatusBody(BaseModel):
    status: str


@router.patch("/{appointment_id}/status")
async def update_appointment_status(
    appointment_id: uuid.UUID,
    body: UpdateAppointmentStatusBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Update the status of an appointment."""
    valid_statuses = {"confirmed", "unconfirmed", "arrived", "completed", "cancelled", "no_show"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    stmt = select(Appointment).where(Appointment.id == appointment_id)
    result = await db.execute(stmt)
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt.status = body.status
    await db.commit()
    await db.refresh(appt)

    # Push attendance change to 1Denta if the appointment originated there
    if appt.external_id and not appt.external_id.startswith("local-"):
        try:
            svc = await OneDentaService.from_db(db)
            attendance = svc._ATTENDANCE_MAP.get(body.status)
            if attendance is not None:
                await svc.update_visit(appt.external_id, attendance=attendance)
        except Exception:
            pass  # 1Denta sync is best-effort; don't fail the local update

    return {"id": str(appt.id), "status": appt.status}


@router.post("/sync")
async def trigger_sync(
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Fast manual sync: directories (doctors) + appointments for ±3 weeks.
    Full patient sync runs nightly via Celery (sync_full_daily at 03:00)."""
    from app.tasks.sync_1denta import _sync_directories_async, _sync_appointments_async

    # Always refresh doctor list first so appointment sync has correct names
    dir_result = await _sync_directories_async()
    appt_result = await _sync_appointments_async(days_back=7, days_forward=21)

    return {
        "status": "completed",
        "doctors": dir_result.get("resource", 0),
        "appointments": {
            "created": appt_result.get("created", 0),
            "updated": appt_result.get("updated", 0),
            "deleted": appt_result.get("deleted", 0),
            "total": appt_result.get("total", 0),
        },
    }


class CreateAppointmentBody(BaseModel):
    patient_name: str
    patient_phone: str
    patient_email: str | None = None
    doctor_id: str
    doctor_name: str
    service: str
    service_ids: list[str] = []
    scheduled_at: str
    duration_min: int = 30
    comment: str = ""
    branch: str = ""


@router.post("/", status_code=201)
async def create_appointment(
    body: CreateAppointmentBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Create a new appointment in 1Denta and mirror it locally.

    1Denta is the source of truth: the visit must be created there first
    (requires a service enabled for online booking), otherwise the request
    fails and nothing is stored locally.
    """
    try:
        parsed_dt = datetime.fromisoformat(body.scheduled_at)
    except ValueError:
        raise HTTPException(status_code=422, detail="Неверный формат даты/времени")

    if not body.service_ids:
        raise HTTPException(
            status_code=422,
            detail="Выберите услугу из онлайн-записи 1Denta — без неё запись нельзя создать в 1Denta",
        )

    # 1Denta принимает телефон только как +7XXXXXXXXXX — проверяем заранее,
    # чтобы вернуть понятную ошибку вместо 422 от 1Denta
    normalized_phone = OneDentaService.normalize_phone(body.patient_phone)
    if len(normalized_phone) != 12 or not normalized_phone.startswith("+7"):
        raise HTTPException(
            status_code=422,
            detail="Неверный формат телефона — укажите российский номер из 11 цифр, например +7 999 123-45-67",
        )

    scheduled_dt = parsed_dt
    if scheduled_dt.tzinfo is None:
        scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
    end_dt = scheduled_dt + timedelta(minutes=body.duration_min)

    # Check for overlapping appointments with the same doctor
    if body.doctor_id:
        day_start = scheduled_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = scheduled_dt.replace(hour=23, minute=59, second=59, microsecond=0)
        existing_stmt = select(Appointment).where(
            Appointment.doctor_id == body.doctor_id,
            Appointment.status.notin_(["cancelled", "no_show"]),
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at <= day_end,
        )
        existing = (await db.execute(existing_stmt)).scalars().all()
        for appt in existing:
            appt_start = appt.scheduled_at
            if appt_start.tzinfo is None:
                appt_start = appt_start.replace(tzinfo=timezone.utc)
            appt_end = appt_start + timedelta(minutes=appt.duration_min or 30)
            if appt_start < end_dt and appt_end > scheduled_dt:
                raise HTTPException(
                    status_code=409,
                    detail=f"Время пересекается с другой записью у этого врача ({appt_start.strftime('%H:%M')}–{appt_end.strftime('%H:%M')})",
                )

    # Duplicate phones exist in real 1Denta data — take the oldest match
    # instead of scalar_one_or_none(), which raises on duplicates.
    patient_stmt = (
        select(Patient)
        .where(Patient.phone == body.patient_phone)
        .order_by(Patient.created_at)
        .limit(1)
    )
    patient = (await db.execute(patient_stmt)).scalars().first()

    if not patient:
        patient = Patient(
            name=body.patient_name,
            phone=body.patient_phone,
            email=body.patient_email,
            source_channel="manual",
            is_new_patient=True,
        )
        db.add(patient)
        await db.flush()

    import httpx

    try:
        svc = await OneDentaService.from_db(db)
        result = await svc.create_visit(
            name=body.patient_name,
            phone=body.patient_phone,
            email=body.patient_email,
            service_ids=body.service_ids,
            resource_id=body.doctor_id,
            dt=body.scheduled_at,
            comment=body.comment,
        )
        external_id = str(result.get("id", "") or "")
        logger.info("1Denta: visit created, external_id=%s", external_id)
    except httpx.HTTPStatusError as e:
        logger.exception("1Denta: failed to create visit for patient=%s dt=%s", body.patient_phone, body.scheduled_at)
        resp_text = e.response.text[:300]
        # Известные коды 1Denta → понятные сообщения
        if "SlotUnavailableError" in resp_text:
            detail = (
                "1Denta: выбранное время недоступно для онлайн-записи у этого врача — "
                "оно занято или вне его графика. Выберите другое время "
                "(доступность определяется графиком врача в 1Denta)."
            )
        elif "Invalid value visit.user.phone" in resp_text:
            detail = "1Denta: неверный формат телефона пациента"
        else:
            detail = f"1Denta отклонила создание записи (HTTP {e.response.status_code}): {resp_text[:200]}"
        raise HTTPException(status_code=502, detail=detail)
    except Exception as e:
        logger.exception("1Denta: failed to create visit for patient=%s dt=%s", body.patient_phone, body.scheduled_at)
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось создать запись в 1Denta: {e}",
        )

    # Вебхук 1Denta о созданном визите может прийти раньше, чем мы вставим
    # свою строку — тогда запись уже в базе, и слепой INSERT упал бы на
    # уникальности external_id. Подхватываем существующую строку.
    appt = None
    if external_id:
        appt = (await db.execute(
            select(Appointment).where(Appointment.external_id == external_id)
        )).scalars().first()

    if appt is None:
        appt = Appointment(
            external_id=external_id or f"local-{uuid.uuid4().hex[:8]}",
            patient_id=patient.id,
            doctor_name=body.doctor_name,
            doctor_id=body.doctor_id,
            service=body.service,
            branch=body.branch,
            scheduled_at=parsed_dt,
            duration_min=body.duration_min,
            status="unconfirmed",
        )
        db.add(appt)
    else:
        appt.patient_id = appt.patient_id or patient.id
        appt.doctor_name = body.doctor_name or appt.doctor_name
        appt.doctor_id = body.doctor_id or appt.doctor_id
        appt.service = body.service or appt.service
        appt.scheduled_at = parsed_dt
        appt.duration_min = body.duration_min or appt.duration_min
        appt.comment = body.comment or appt.comment

    from sqlalchemy.exc import IntegrityError
    try:
        await db.flush()
    except IntegrityError:
        # Остаточная гонка с вебхуком: строка появилась между SELECT и INSERT.
        # Визит в 1Denta создан и запись в базе есть — возвращаем её.
        await db.rollback()
        existing = (await db.execute(
            select(Appointment).where(Appointment.external_id == external_id)
        )).scalars().first()
        if existing is None:
            raise HTTPException(status_code=500, detail="Не удалось сохранить запись — попробуйте обновить расписание")
        appt = existing

    return {
        "id": str(appt.id),
        "external_id": appt.external_id,
        "patient_name": body.patient_name,
        "doctor_name": body.doctor_name,
        "scheduled_at": body.scheduled_at,
        "status": "unconfirmed",
        "synced_with_1denta": bool(external_id),
    }


@router.delete("/{appointment_id}", status_code=200)
async def delete_appointment(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Delete appointment locally and cancel in 1Denta if synced."""
    stmt = select(Appointment).where(Appointment.id == appointment_id)
    appt = (await db.execute(stmt)).scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    external_id = appt.external_id
    synced_with_1denta = bool(external_id and not external_id.startswith("local-"))

    one_denta_deleted = False
    if synced_with_1denta:
        try:
            svc = await OneDentaService.from_db(db)
            await svc.delete_visit(external_id)
            one_denta_deleted = True
            logger.info("1Denta: visit %s deleted", external_id)
        except Exception:
            logger.exception("1Denta: failed to delete visit %s", external_id)

    await db.delete(appt)
    await db.commit()

    return {
        "deleted": True,
        "synced_with_1denta": synced_with_1denta,
        "one_denta_deleted": one_denta_deleted,
    }


@router.get("/services")
async def list_services(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return available services from 1Denta."""
    svc = await OneDentaService.from_db(db)
    services = await svc.get_services()
    return {"services": services}


@router.get("/slots")
async def available_slots(
    resource_id: str = Query(..., description="Doctor resource ID"),
    service_ids: str = Query("1", description="Comma-separated service IDs"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return available time slots for a doctor on a given date."""
    svc = await OneDentaService.from_db(db)
    ids = [s.strip() for s in service_ids.split(",")]
    slots = await svc.get_available_slots(resource_id=resource_id, service_ids=ids, date=date)
    return {"slots": slots}
