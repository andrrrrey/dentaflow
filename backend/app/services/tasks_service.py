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

    # Fetch today's appointments
    appts_result = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.scheduled_at >= today_start,
                Appointment.scheduled_at < today_end,
                Appointment.status.in_(["scheduled", "confirmed"]),
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


async def create_yesterday_followup_tasks(db: AsyncSession) -> dict:
    """Create follow-up tasks for yesterday's appointments.

    For every non-cancelled appointment yesterday:
      1. Task asking whether the patient attended.
    For appointments that were confirmed before the appointment:
      2. Task asking whether the service was purchased / result recorded in MIS.
    """
    from datetime import date, timedelta
    from sqlalchemy import and_
    from app.models.appointment import Appointment
    from app.models.patient import Patient

    today = date.today()
    yesterday = today - timedelta(days=1)
    yesterday_start = datetime(yesterday.year, yesterday.month, yesterday.day, tzinfo=timezone.utc)
    yesterday_end = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    end_of_today = yesterday_end + timedelta(days=1) - timedelta(seconds=1)

    appts_result = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.scheduled_at >= yesterday_start,
                Appointment.scheduled_at < yesterday_end,
                Appointment.status.notin_(["cancelled"]),
            )
        )
    )
    appointments = appts_result.scalars().all()

    if not appointments:
        return {"created": 0, "skipped": 0}

    appt_ids = [a.id for a in appointments]

    # Find existing follow-up auto tasks for these appointments to avoid duplication
    existing_result = await db.execute(
        select(Task.appointment_id, Task.title).where(
            and_(
                Task.is_auto == True,
                Task.appointment_id.in_(appt_ids),
                Task.created_at >= yesterday_end,  # created today (i.e. morning follow-up run)
            )
        )
    )
    existing_rows = existing_result.all()
    # Key: (appointment_id, title_prefix) to detect duplicates
    existing_keys = {(str(r.appointment_id), r.title[:10] if r.title else "") for r in existing_rows}

    patient_ids = [a.patient_id for a in appointments if a.patient_id]
    patient_names: dict[uuid.UUID, str] = {}
    if patient_ids:
        p_result = await db.execute(
            select(Patient.id, Patient.name).where(Patient.id.in_(patient_ids))
        )
        patient_names = {row.id: row.name for row in p_result.all()}

    created = 0
    skipped = 0

    for appt in appointments:
        patient_name = patient_names.get(appt.patient_id, "Пациент") if appt.patient_id else "Пациент"
        time_str = appt.scheduled_at.strftime("%H:%M") if appt.scheduled_at else ""
        service_str = appt.service or "Услуга"

        # Task 1: Did patient attend?
        title_attendance = f"Явился ли {patient_name} на приём — {service_str} ({time_str} вчера)?"
        key_attendance = (str(appt.id), title_attendance[:10])
        if key_attendance not in existing_keys:
            db.add(Task(
                patient_id=appt.patient_id,
                appointment_id=appt.id,
                type="followup",
                title=title_attendance,
                due_at=end_of_today,
                is_done=False,
                is_auto=True,
                is_active=True,
            ))
            existing_keys.add(key_attendance)
            created += 1
        else:
            skipped += 1

        # Task 2 (only for confirmed): Was service purchased / result in MIS?
        if appt.status == "confirmed":
            title_payment = f"Куплена ли услуга / записан результат в МИС — {patient_name} — {service_str}?"
            key_payment = (str(appt.id), title_payment[:10])
            if key_payment not in existing_keys:
                db.add(Task(
                    patient_id=appt.patient_id,
                    appointment_id=appt.id,
                    type="followup",
                    title=title_payment,
                    due_at=end_of_today,
                    is_done=False,
                    is_auto=True,
                    is_active=True,
                ))
                existing_keys.add(key_payment)
                created += 1
            else:
                skipped += 1

    await db.commit()
    return {"created": created, "skipped": skipped}


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
