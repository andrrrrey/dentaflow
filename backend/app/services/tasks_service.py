"""Task service — real database queries."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskListResponse, TaskResponse


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(
    task: Task,
    patient_name: str | None = None,
    completed_by_name: str | None = None,
) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        patient_id=task.patient_id,
        patient_name=patient_name,
        deal_id=task.deal_id,
        comm_id=task.comm_id,
        assigned_to=task.assigned_to,
        assigned_to_name=None,
        created_by=task.created_by,
        completed_by=task.completed_by,
        completed_by_name=completed_by_name,
        appointment_id=task.appointment_id,
        type=task.type,
        title=task.title,
        due_at=task.due_at,
        done_at=task.done_at,
        is_done=task.is_done,
        is_auto=task.is_auto,
        is_active=task.is_active,
        created_at=task.created_at,
    )


async def _enrich_with_names(
    db: AsyncSession, tasks: list[Task]
) -> list[TaskResponse]:
    """Attach patient_name and completed_by_name for tasks."""
    patient_ids = {t.patient_id for t in tasks if t.patient_id}
    patient_names: dict[uuid.UUID, str] = {}
    if patient_ids:
        result = await db.execute(
            select(Patient.id, Patient.name).where(Patient.id.in_(patient_ids))
        )
        patient_names = {row.id: row.name for row in result.all()}

    user_ids = {t.completed_by for t in tasks if t.completed_by}
    user_names: dict[uuid.UUID, str] = {}
    if user_ids:
        result = await db.execute(
            select(User.id, User.name).where(User.id.in_(user_ids))
        )
        user_names = {row.id: row.name for row in result.all()}

    return [
        _to_response(t, patient_names.get(t.patient_id), user_names.get(t.completed_by))
        for t in tasks
    ]


async def list_tasks(
    db: AsyncSession,
    assigned_to: str | None = None,
    is_done: bool | None = None,
    deal_id: str | None = None,
    is_active: bool | None = None,
) -> TaskListResponse:
    stmt = select(Task)

    if assigned_to and assigned_to != "me":
        try:
            stmt = stmt.where(Task.assigned_to == uuid.UUID(assigned_to))
        except ValueError:
            pass

    if is_done is not None:
        stmt = stmt.where(Task.is_done == is_done)

    if deal_id:
        try:
            stmt = stmt.where(Task.deal_id == uuid.UUID(deal_id))
        except ValueError:
            pass

    if is_active is not None:
        stmt = stmt.where(Task.is_active == is_active)

    stmt = stmt.order_by(Task.created_at.desc())
    result = await db.execute(stmt)
    tasks = result.scalars().all()

    now = _now()
    overdue = [t for t in tasks if not t.is_done and t.due_at and t.due_at < now]

    items = await _enrich_with_names(db, list(tasks))
    return TaskListResponse(items=items, total=len(items), overdue_count=len(overdue))


async def create_task(
    db: AsyncSession,
    type: str,
    title: str,
    due_at: datetime,
    patient_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    assigned_to: uuid.UUID | None = None,
) -> TaskResponse:
    task = Task(
        patient_id=patient_id,
        deal_id=deal_id,
        assigned_to=assigned_to,
        type=type,
        title=title,
        due_at=due_at,
        is_done=False,
        is_auto=False,
        is_active=True,
    )
    db.add(task)
    await db.flush()

    patient_name: str | None = None
    if patient_id:
        patient = await db.get(Patient, patient_id)
        patient_name = patient.name if patient else None

    await db.commit()
    return _to_response(task, patient_name)


async def update_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    current_user_id: uuid.UUID | None = None,
    is_done: bool | None = None,
    done_at: datetime | None = None,
    title: str | None = None,
    due_at: datetime | None = None,
) -> TaskResponse | None:
    task = await db.get(Task, task_id)
    if task is None:
        return None

    award_points_for_completion = False

    if is_done is not None:
        task.is_done = is_done
        if is_done and task.done_at is None:
            task.done_at = _now()
            if current_user_id and not task.completed_by:
                task.completed_by = current_user_id
                award_points_for_completion = True
        elif not is_done:
            task.done_at = None
            task.completed_by = None
    if done_at is not None:
        task.done_at = done_at
    if title is not None:
        task.title = title
    if due_at is not None:
        task.due_at = due_at

    await db.commit()

    if award_points_for_completion and current_user_id:
        from app.services.rewards_service import award_points
        await award_points(
            db=db,
            user_id=current_user_id,
            action_type="task_completed",
            task_id=task_id,
            description=f"Выполнена задача: {task.title or ''}",
        )

    patient_name: str | None = None
    if task.patient_id:
        patient = await db.get(Patient, task.patient_id)
        patient_name = patient.name if patient else None

    completed_by_name: str | None = None
    if task.completed_by:
        user = await db.get(User, task.completed_by)
        completed_by_name = user.name if user else None

    return _to_response(task, patient_name, completed_by_name)


async def delete_task(db: AsyncSession, task_id: uuid.UUID) -> None:
    task = await db.get(Task, task_id)
    if task is not None:
        await db.delete(task)
        await db.commit()


async def create_auto_tasks_for_today(db: AsyncSession) -> dict:
    """Create call tasks for today's scheduled/confirmed appointments."""
    from datetime import date, timedelta
    from sqlalchemy import and_, cast, Date, func as sqlfunc
    from app.models.appointment import Appointment
    from app.models.patient import Patient

    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)

    # Fetch today's appointments that still need a confirmation call.
    # 1Denta maps attendance -> status as: 0=unconfirmed (default for new
    # bookings), 2=confirmed, 1=arrived, -1=cancelled. "scheduled" is a legacy
    # value kept for manually created local appointments. We must include
    # "unconfirmed" here — it's the status of almost every synced appointment,
    # and omitting it meant no call tasks were ever created.
    appts_result = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.scheduled_at >= today_start,
                Appointment.scheduled_at < today_end,
                Appointment.status.in_(["unconfirmed", "scheduled", "confirmed"]),
            )
        )
    )
    appointments = appts_result.scalars().all()

    if not appointments:
        return {"created": 0, "skipped": 0}

    # Fetch existing auto tasks for today to avoid duplicates
    appt_ids = [a.id for a in appointments]
    existing_result = await db.execute(
        select(Task.appointment_id).where(
            and_(
                Task.is_auto == True,
                Task.appointment_id.in_(appt_ids),
                Task.created_at >= today_start,
                Task.created_at < today_end,
            )
        )
    )
    existing_appt_ids = {row[0] for row in existing_result.all()}

    # Fetch patient names
    patient_ids = [a.patient_id for a in appointments if a.patient_id]
    patient_names: dict[uuid.UUID, str] = {}
    if patient_ids:
        p_result = await db.execute(
            select(Patient.id, Patient.name).where(Patient.id.in_(patient_ids))
        )
        patient_names = {row.id: row.name for row in p_result.all()}

    end_of_day = today_end - timedelta(seconds=1)

    created = 0
    skipped = 0
    for appt in appointments:
        if appt.id in existing_appt_ids:
            skipped += 1
            continue

        patient_name = patient_names.get(appt.patient_id, "Пациент") if appt.patient_id else "Пациент"
        time_str = appt.scheduled_at.strftime("%H:%M") if appt.scheduled_at else ""
        service_str = appt.service or "Услуга"
        title = f"Позвонить: {patient_name} — {service_str} — {time_str}"

        task = Task(
            patient_id=appt.patient_id,
            appointment_id=appt.id,
            type="confirm_appointment",
            title=title,
            due_at=end_of_day,
            is_done=False,
            is_auto=True,
            is_active=True,
        )
        db.add(task)
        created += 1

    await db.commit()
    return {"created": created, "skipped": skipped}


async def create_yesterday_followup_tasks(
    db: AsyncSession,
    one_denta_visits: list,
) -> dict:
    """Create tasks for yesterday's patients where 1Denta has no visit records.

    Logic:
      - Only for visits where patient arrived (status == "arrived", attendance=1 in 1Denta)
      - Check if visit has records: payment_amount > 0 OR services with paySum > 0 OR non-empty comment
      - If patient came but no records exist → create task "Внести записи о приёме в МИС"
    """
    from datetime import date, timedelta
    from sqlalchemy import and_
    from app.models.appointment import Appointment
    from app.models.patient import Patient

    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    end_of_today = today_start + timedelta(days=1) - timedelta(seconds=1)

    # Filter: patient arrived (1Denta attendance=1 maps to "arrived")
    arrived_visits = [v for v in one_denta_visits if v.get("status") == "arrived"]

    if not arrived_visits:
        return {"created": 0, "skipped": 0, "total_arrived": 0}

    # Keep only visits with no records
    def _has_records(v: dict) -> bool:
        if (v.get("payment_amount") or 0) > 0:
            return True
        services = v.get("services_data") or []
        if any(float(s.get("paySum") or 0) > 0 for s in services):
            return True
        if (v.get("comment") or "").strip():
            return True
        return False

    no_records_visits = [v for v in arrived_visits if not _has_records(v)]

    if not no_records_visits:
        return {"created": 0, "skipped": len(arrived_visits), "total_arrived": len(arrived_visits)}

    # Map external_ids to local appointment/patient records
    appt_ext_ids = [v["external_id"] for v in no_records_visits if v.get("external_id")]
    patient_ext_ids = [v["patient_external_id"] for v in no_records_visits if v.get("patient_external_id")]

    appt_rows: dict[str, uuid.UUID] = {}
    if appt_ext_ids:
        result = await db.execute(
            select(Appointment.external_id, Appointment.id).where(
                Appointment.external_id.in_(appt_ext_ids)
            )
        )
        appt_rows = {row.external_id: row.id for row in result.all()}

    patient_rows: dict[str, tuple[uuid.UUID, str]] = {}
    if patient_ext_ids:
        result = await db.execute(
            select(Patient.external_id, Patient.id, Patient.name).where(
                Patient.external_id.in_(patient_ext_ids)
            )
        )
        patient_rows = {row.external_id: (row.id, row.name) for row in result.all()}

    # Find existing tasks created today for these appointments to avoid duplicates
    local_appt_ids = list(appt_rows.values())
    existing_appt_ids: set[str] = set()
    if local_appt_ids:
        existing_result = await db.execute(
            select(Task.appointment_id).where(
                and_(
                    Task.is_auto == True,
                    Task.appointment_id.in_(local_appt_ids),
                    Task.type == "followup",
                    Task.created_at >= today_start,
                )
            )
        )
        existing_appt_ids = {str(r[0]) for r in existing_result.all()}

    created = 0
    skipped = 0

    for visit in no_records_visits:
        ext_id = visit.get("external_id")
        patient_ext_id = visit.get("patient_external_id")
        local_appt_id = appt_rows.get(ext_id) if ext_id else None

        # Skip if task already created today for this appointment
        if local_appt_id and str(local_appt_id) in existing_appt_ids:
            skipped += 1
            continue

        patient_id: uuid.UUID | None = None
        patient_name = "Пациент"
        if patient_ext_id and patient_ext_id in patient_rows:
            patient_id, patient_name = patient_rows[patient_ext_id]

        service_str = visit.get("service") or "Услуга"
        scheduled_at = visit.get("scheduled_at")
        time_str = ""
        if scheduled_at:
            try:
                dt = datetime.fromisoformat(scheduled_at)
                time_str = dt.strftime("%H:%M")
            except Exception:
                pass

        title = (
            f"Внести записи о приёме в МИС — {patient_name} — "
            f"{service_str} ({time_str} вчера): указать проданные услуги"
        )

        db.add(Task(
            patient_id=patient_id,
            appointment_id=local_appt_id,
            type="followup",
            title=title,
            due_at=end_of_today,
            is_done=False,
            is_auto=True,
            is_active=True,
        ))
        created += 1

    await db.commit()
    return {
        "created": created,
        "skipped": skipped,
        "total_arrived": len(arrived_visits),
        "no_records": len(no_records_visits),
    }


async def deactivate_expired_tasks(db: AsyncSession) -> dict:
    """Mark uncompleted auto tasks from previous days as inactive."""
    from datetime import date
    from sqlalchemy import update, and_

    today = date.today()
    today_midnight = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    result = await db.execute(
        select(Task).where(
            and_(
                Task.is_auto == True,
                Task.is_done == False,
                Task.is_active == True,
                Task.due_at < today_midnight,
            )
        )
    )
    tasks = result.scalars().all()
    count = len(tasks)
    for task in tasks:
        task.is_active = False

    await db.commit()
    return {"deactivated": count}
