import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskListResponse, TaskResponse, TaskUpdate
from app.services.tasks_service import create_task, list_tasks, update_task

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


@router.get("/", response_model=TaskListResponse)
async def get_tasks(
    assigned_to: str | None = Query(None, description="Filter: 'me' or user UUID"),
    is_done: bool | None = Query(None, description="Filter by completion status"),
    _current_user: User = Depends(get_current_user),
) -> TaskListResponse:
    return await list_tasks(assigned_to=assigned_to, is_done=is_done)


@router.post("/", response_model=TaskResponse, status_code=201)
async def create_new_task(
    body: TaskCreate,
    _current_user: User = Depends(get_current_user),
) -> TaskResponse:
    return await create_task(
        type=body.type,
        title=body.title,
        due_at=body.due_at,
        patient_id=body.patient_id,
        assigned_to=body.assigned_to,
    )


@router.patch("/{task_id}", response_model=TaskResponse)
async def patch_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    _current_user: User = Depends(get_current_user),
) -> TaskResponse:
    updated = await update_task(
        task_id=task_id,
        is_done=body.is_done,
        done_at=body.done_at,
        title=body.title,
        due_at=body.due_at,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated
