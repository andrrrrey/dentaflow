"""Task service — real database queries."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient
from app.models.task import Task
from app.schemas.task import TaskListResponse, TaskResponse


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(task: Task, patient_name: str | None = None) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        patient_id=task.patient_id,
        patient_name=patient_name,
        deal_id=task.deal_id,
        comm_id=task.comm_id,
        assigned_to=task.assigned_to,
        assigned_to_name=None,
        created_by=task.created_by,
        type=task.type,
        title=task.title,
        due_at=task.due_at,
        done_at=task.done_at,
        is_done=task.is_done,
        created_at=task.created_at,
    )


async def _enrich_with_names(
    db: AsyncSession, tasks: list[Task]
) -> list[TaskResponse]:
    """Attach patient_name for each task that has a patient_id."""
    patient_ids = {t.patient_id for t in tasks if t.patient_id}
    names: dict[uuid.UUID, str] = {}
    if patient_ids:
        result = await db.execute(
            select(Patient.id, Patient.name).where(Patient.id.in_(patient_ids))
        )
        names = {row.id: row.name for row in result.all()}

    return [_to_response(t, names.get(t.patient_id)) for t in tasks]


async def list_tasks(
    db: AsyncSession,
    assigned_to: str | None = None,
    is_done: bool | None = None,
    deal_id: str | None = None,
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
    is_done: bool | None = None,
    done_at: datetime | None = None,
    title: str | None = None,
    due_at: datetime | None = None,
) -> TaskResponse | None:
    task = await db.get(Task, task_id)
    if task is None:
        return None

    if is_done is not None:
        task.is_done = is_done
        if is_done and task.done_at is None:
            task.done_at = _now()
        elif not is_done:
            task.done_at = None
    if done_at is not None:
        task.done_at = done_at
    if title is not None:
        task.title = title
    if due_at is not None:
        task.due_at = due_at

    await db.commit()

    patient_name: str | None = None
    if task.patient_id:
        patient = await db.get(Patient, task.patient_id)
        patient_name = patient.name if patient else None

    return _to_response(task, patient_name)


async def delete_task(db: AsyncSession, task_id: uuid.UUID) -> None:
    task = await db.get(Task, task_id)
    if task is not None:
        await db.delete(task)
        await db.commit()
