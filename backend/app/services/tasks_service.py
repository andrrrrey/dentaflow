"""Mock data service for tasks."""

import uuid
from datetime import datetime, timedelta, timezone

from app.schemas.task import TaskListResponse, TaskResponse

_now = datetime.now(timezone.utc)


def _dt(days_ago: int, hours: int = 10) -> datetime:
    return _now - timedelta(days=days_ago, hours=hours)


def _future(days: int, hours: int = 14) -> datetime:
    return _now + timedelta(days=days, hours=hours)


# Pre-generated UUIDs for stable mock data
_task_uuids = [uuid.UUID(f"a1000000-0000-4000-a000-{i:012d}") for i in range(12)]
_patient_uuids = [uuid.UUID(f"00000000-0000-4000-a000-{i:012d}") for i in range(20, 30)]
_assigned_uuids = [
    uuid.UUID("a0000000-0000-4000-a000-000000000001"),
    uuid.UUID("a0000000-0000-4000-a000-000000000002"),
    uuid.UUID("a0000000-0000-4000-a000-000000000003"),
]

MOCK_TASKS: list[TaskResponse] = [
    TaskResponse(
        id=_task_uuids[0],
        patient_id=_patient_uuids[0],
        patient_name="Иванов Сергей",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        created_by=_assigned_uuids[1],
        type="callback",
        title="Перезвонить Ивановой",
        due_at=_dt(-1),  # overdue (yesterday)
        done_at=None,
        is_done=False,
        created_at=_dt(3),
    ),
    TaskResponse(
        id=_task_uuids[1],
        patient_id=_patient_uuids[1],
        patient_name="Петрова Мария",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        created_by=_assigned_uuids[0],
        type="confirm_appointment",
        title="Подтвердить запись Петрова",
        due_at=_future(0, 2),  # today
        done_at=None,
        is_done=False,
        created_at=_dt(1),
    ),
    TaskResponse(
        id=_task_uuids[2],
        patient_id=_patient_uuids[2],
        patient_name="Кузнецов Алексей",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        created_by=_assigned_uuids[0],
        type="followup",
        title="Отправить план лечения Кузнецову",
        due_at=_future(1),
        done_at=None,
        is_done=False,
        created_at=_dt(2),
    ),
    TaskResponse(
        id=_task_uuids[3],
        patient_id=_patient_uuids[3],
        patient_name="Сидорова Елена",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        created_by=_assigned_uuids[1],
        type="callback",
        title="Связаться с Сидоровой по результатам КТ",
        due_at=_dt(-2),  # overdue
        done_at=None,
        is_done=False,
        created_at=_dt(5),
    ),
    TaskResponse(
        id=_task_uuids[4],
        patient_id=_patient_uuids[4],
        patient_name="Морозов Дмитрий",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        created_by=_assigned_uuids[2],
        type="other",
        title="Подготовить документы для Морозова",
        due_at=_future(2),
        done_at=None,
        is_done=False,
        created_at=_dt(1),
    ),
    TaskResponse(
        id=_task_uuids[5],
        patient_id=_patient_uuids[5],
        patient_name="Васильева Ольга",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        created_by=_assigned_uuids[1],
        type="confirm_appointment",
        title="Подтвердить визит Васильевой на пятницу",
        due_at=_future(3),
        done_at=None,
        is_done=False,
        created_at=_dt(0),
    ),
    TaskResponse(
        id=_task_uuids[6],
        patient_id=_patient_uuids[6],
        patient_name="Новиков Артём",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        created_by=_assigned_uuids[0],
        type="followup",
        title="Написать Новикову в Telegram",
        due_at=_dt(1),
        done_at=_dt(0),
        is_done=True,
        created_at=_dt(4),
    ),
    TaskResponse(
        id=_task_uuids[7],
        patient_id=_patient_uuids[7],
        patient_name="Федорова Наталья",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        created_by=_assigned_uuids[0],
        type="callback",
        title="Перезвонить Федоровой по поводу оплаты",
        due_at=_dt(3),
        done_at=_dt(2),
        is_done=True,
        created_at=_dt(5),
    ),
    TaskResponse(
        id=_task_uuids[8],
        patient_id=_patient_uuids[8],
        patient_name="Козлов Андрей",
        deal_id=None,
        comm_id=None,
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        created_by=_assigned_uuids[2],
        type="other",
        title="Уточнить у лаборатории срок изготовления виниров Козлова",
        due_at=_dt(-1, 5),  # overdue
        done_at=None,
        is_done=False,
        created_at=_dt(4),
    ),
]


async def list_tasks(
    assigned_to: str | None = None,
    is_done: bool | None = None,
) -> TaskListResponse:
    """Return filtered task list."""
    tasks = list(MOCK_TASKS)

    if assigned_to == "me":
        # In mock, return tasks for the first assigned user
        tasks = [t for t in tasks if t.assigned_to == _assigned_uuids[0]]
    elif assigned_to:
        tasks = [t for t in tasks if str(t.assigned_to) == assigned_to]

    if is_done is not None:
        tasks = [t for t in tasks if t.is_done == is_done]

    overdue = [
        t
        for t in tasks
        if not t.is_done and t.due_at is not None and t.due_at < _now
    ]

    return TaskListResponse(
        items=tasks,
        total=len(tasks),
        overdue_count=len(overdue),
    )


async def create_task(
    type: str,
    title: str,
    due_at: datetime,
    patient_id: uuid.UUID | None = None,
    assigned_to: uuid.UUID | None = None,
) -> TaskResponse:
    new_task = TaskResponse(
        id=uuid.uuid4(),
        patient_id=patient_id,
        patient_name=None,
        deal_id=None,
        comm_id=None,
        assigned_to=assigned_to,
        assigned_to_name=None,
        created_by=None,
        type=type,
        title=title,
        due_at=due_at,
        done_at=None,
        is_done=False,
        created_at=_now,
    )
    MOCK_TASKS.append(new_task)
    return new_task


async def delete_task(task_id: uuid.UUID) -> None:
    for i, task in enumerate(MOCK_TASKS):
        if task.id == task_id:
            MOCK_TASKS.pop(i)
            return


async def update_task(
    task_id: uuid.UUID,
    is_done: bool | None = None,
    done_at: datetime | None = None,
    title: str | None = None,
    due_at: datetime | None = None,
) -> TaskResponse | None:
    for i, task in enumerate(MOCK_TASKS):
        if task.id == task_id:
            data = task.model_dump()
            if is_done is not None:
                data["is_done"] = is_done
                if is_done and data.get("done_at") is None:
                    data["done_at"] = _now
            if done_at is not None:
                data["done_at"] = done_at
            if title is not None:
                data["title"] = title
            if due_at is not None:
                data["due_at"] = due_at
            updated = TaskResponse(**data)
            MOCK_TASKS[i] = updated
            return updated
    return None
