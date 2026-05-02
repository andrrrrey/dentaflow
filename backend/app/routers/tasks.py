import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskListResponse, TaskResponse, TaskUpdate
from app.services.tasks_service import create_task, delete_task, list_tasks, update_task

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


@router.get("/", response_model=TaskListResponse)
async def get_tasks(
    assigned_to: str | None = Query(None),
    is_done: bool | None = Query(None),
    deal_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TaskListResponse:
    return await list_tasks(db=db, assigned_to=assigned_to, is_done=is_done, deal_id=deal_id)


@router.post("/", response_model=TaskResponse, status_code=201)
async def create_new_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TaskResponse:
    return await create_task(
        db=db,
        type=body.type,
        title=body.title,
        due_at=body.due_at,
        patient_id=body.patient_id,
        deal_id=body.deal_id,
        assigned_to=body.assigned_to,
    )


@router.delete("/{task_id}", status_code=204)
async def remove_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Response:
    await delete_task(db=db, task_id=task_id)
    return Response(status_code=204)


@router.patch("/{task_id}", response_model=TaskResponse)
async def patch_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TaskResponse:
    updated = await update_task(
        db=db,
        task_id=task_id,
        is_done=body.is_done,
        done_at=body.done_at,
        title=body.title,
        due_at=body.due_at,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated
