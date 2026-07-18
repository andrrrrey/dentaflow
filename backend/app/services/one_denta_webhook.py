"""Обработка входящих вебхуков 1Denta (SQNS CRM Exchange API v2).

SQNS шлёт payload при создании/изменении/удалении сущностей: visit, client,
service, commodity (см. sqns_api_endpoints.md §4). Здесь — идемпотентные
апсерты/удаления по external_id. Карты ресурсов/услуг строятся из
directory_cache, а не из API 1Denta: вебхук не должен дёргать авторизацию
(риск блокировки 423).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.directory_cache import DirectoryCache
from app.models.patient import Patient
from app.models.task import Task
from app.services.one_denta import OneDentaService, parse_birthdate

logger = logging.getLogger(__name__)


async def _load_maps(db: AsyncSession) -> tuple[dict[str, str], dict[str, int]]:
    """resource_id → имя врача; service_id → durationSeconds из directory_cache."""
    resource_map: dict[str, str] = {}
    service_duration_map: dict[str, int] = {}
    rows = (await db.execute(
        select(DirectoryCache).where(DirectoryCache.category.in_(["resource", "service"]))
    )).scalars().all()
    for row in rows:
        if not row.external_id:
            continue
        if row.category == "resource" and row.name:
            resource_map[row.external_id] = row.name
        elif row.category == "service":
            dur_min = (row.data or {}).get("duration")
            if dur_min:
                service_duration_map[row.external_id] = int(dur_min) * 60
    return resource_map, service_duration_map


async def _delete_appointment_by_external_id(db: AsyncSession, ext_id: str) -> bool:
    appt_ids = list((await db.execute(
        select(Appointment.id).where(Appointment.external_id == ext_id)
    )).scalars().all())
    if not appt_ids:
        return False
    # tasks.appointment_id has no ON DELETE — unlink before deleting
    await db.execute(
        update(Task).where(Task.appointment_id.in_(appt_ids)).values(appointment_id=None)
    )
    await db.execute(delete(Appointment).where(Appointment.id.in_(appt_ids)))
    return True


async def apply_visit_event(db: AsyncSession, visit: dict) -> dict:
    """Апсерт/удаление одной записи расписания по payload визита."""
    raw_id = visit.get("id")
    if raw_id is None:
        return {"action": "skipped", "reason": "no visit id"}
    ext_id = str(raw_id)

    if visit.get("deleted"):
        removed = await _delete_appointment_by_external_id(db, ext_id)
        return {"action": "deleted" if removed else "already_absent", "external_id": ext_id}

    resource_map, service_duration_map = await _load_maps(db)
    a_data = OneDentaService._map_visit(visit, resource_map, service_duration_map)

    scheduled_at = None
    if a_data.get("scheduled_at"):
        try:
            dt = datetime.fromisoformat(a_data["scheduled_at"])
            # Wall-clock 1Denta хранится как есть (см. _sync_appointments_async)
            scheduled_at = dt.replace(tzinfo=None) if dt.tzinfo else dt
        except ValueError:
            pass

    now_utc = datetime.now(timezone.utc)

    # Пациент: по external_id клиента; если не импортирован — минимальная карточка
    patient_id = None
    pext = a_data.get("patient_external_id")
    if pext:
        patient = (await db.execute(
            select(Patient).where(Patient.external_id == pext)
        )).scalars().first()
        if patient is None and (a_data.get("patient_name") or a_data.get("patient_phone")):
            sex_val = a_data.get("patient_sex", 0)
            patient = Patient(
                external_id=pext,
                name=a_data.get("patient_name") or "",
                phone=a_data.get("patient_phone") or None,
                is_new_patient=True,
                patient_type=a_data.get("patient_type"),
                gender="female" if sex_val == 2 else ("male" if sex_val == 1 else None),
                synced_at=now_utc,
            )
            bd = parse_birthdate(a_data.get("patient_birth_date"))
            if bd is not None:
                patient.birth_date = bd
            db.add(patient)
            await db.flush()
        if patient is not None:
            patient_id = patient.id

    appointment = (await db.execute(
        select(Appointment).where(Appointment.external_id == ext_id)
    )).scalars().first()

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
        db.add(appointment)
        action = "created"
    else:
        appointment.patient_id = patient_id or appointment.patient_id
        new_doctor_name = a_data.get("doctor_name")
        if new_doctor_name and (
            not new_doctor_name.startswith("Врач #") or not appointment.doctor_name
        ):
            appointment.doctor_name = new_doctor_name
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
        if appointment.payment_amount is None:
            appointment.payment_amount = a_data.get("payment_amount")
        appointment.services_data = a_data.get("services_data", appointment.services_data)
        appointment.comment = a_data.get("comment", appointment.comment)
        appointment.synced_at = now_utc
        action = "updated"

    return {"action": action, "external_id": ext_id}


async def apply_client_event(db: AsyncSession, client: dict) -> dict:
    """Апсерт пациента по payload клиента."""
    if client.get("id") is None:
        return {"action": "skipped", "reason": "no client id"}
    p_data = OneDentaService._map_client(client)
    ext_id = p_data["external_id"]

    now_utc = datetime.now(timezone.utc)
    sex_val = p_data.get("sex", 0)
    gender_val = "female" if sex_val == 2 else ("male" if sex_val == 1 else None)

    patient = (await db.execute(
        select(Patient).where(Patient.external_id == ext_id)
    )).scalars().first()

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
            patient_type=p_data.get("type"),
            raw_1denta_data=p_data,
            synced_at=now_utc,
        )
        db.add(patient)
        action = "created"
    else:
        patient.name = p_data.get("name") or patient.name
        patient.phone = p_data.get("phone") or patient.phone
        patient.email = p_data.get("email") or patient.email
        patient.is_new_patient = p_data.get("is_new_patient", patient.is_new_patient)
        patient.total_revenue = p_data.get("total_revenue", patient.total_revenue)
        patient.tags = p_data.get("tags", patient.tags)
        patient.gender = gender_val or patient.gender
        patient.patient_type = p_data.get("type") or patient.patient_type
        patient.raw_1denta_data = p_data
        patient.synced_at = now_utc
        action = "updated"

    if p_data.get("birth_date"):
        bd = parse_birthdate(p_data["birth_date"])
        if bd is not None:
            patient.birth_date = bd

    return {"action": action, "external_id": ext_id}


async def apply_directory_event(db: AsyncSession, category: str, item: dict) -> dict:
    """Апсерт одной строки справочника (service | commodity)."""
    from app.routers.directories import _normalize_commodity, _normalize_service

    if item.get("id") is None:
        return {"action": "skipped", "reason": "no id"}
    normalized = _normalize_service(item) if category == "service" else _normalize_commodity(item)
    ext_id = str(item["id"])
    now_utc = datetime.now(timezone.utc)

    row = (await db.execute(
        select(DirectoryCache).where(
            DirectoryCache.category == category,
            DirectoryCache.external_id == ext_id,
        )
    )).scalars().first()
    if row is None:
        db.add(DirectoryCache(
            category=category,
            external_id=ext_id,
            name=normalized.get("name") or "",
            data=normalized,
            synced_at=now_utc,
        ))
        action = "created"
    else:
        # Вебхук-payload услуги не содержит onlineRecord/duration — не затираем
        # кэшированные значения отсутствующими в payload полями.
        old = row.data or {}
        if category == "service":
            if "onlineRecord" not in item and not normalized.get("onlineRecord"):
                normalized["onlineRecord"] = old.get("onlineRecord", False)
            if normalized.get("duration") is None:
                normalized["duration"] = old.get("duration")
        row.name = normalized.get("name") or row.name
        row.data = normalized
        row.synced_at = now_utc
        action = "updated"
    return {"action": action, "category": category, "external_id": ext_id}
