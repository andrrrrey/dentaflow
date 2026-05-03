import uuid

from sqlalchemy import func, select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.communication import Communication
from app.models.patient import Patient
from app.models.user import User
from app.schemas.communication import (
    CommunicationListResponse,
    CommunicationResponse,
    CommunicationUpdate,
)


def _row_to_response(comm: Communication, patient_name: str | None, assigned_name: str | None) -> CommunicationResponse:
    return CommunicationResponse(
        id=comm.id,
        patient_id=comm.patient_id,
        patient_name=patient_name,
        channel=comm.channel,
        direction=comm.direction,
        type=comm.type,
        content=comm.content,
        media_url=comm.media_url,
        duration_sec=comm.duration_sec,
        status=comm.status,
        priority=comm.priority,
        ai_tags=comm.ai_tags,
        ai_summary=comm.ai_summary,
        ai_next_action=comm.ai_next_action,
        assigned_to=comm.assigned_to,
        assigned_to_name=assigned_name,
        responded_at=comm.responded_at,
        created_at=comm.created_at,
    )


async def get_communications(
    *,
    status: str | None = None,
    channel: str | None = None,
    priority: str | None = None,
    page: int = 1,
    limit: int = 50,
    db: AsyncSession,
) -> CommunicationListResponse:
    stmt = (
        select(Communication, Patient.name.label("patient_name"), User.name.label("assigned_name"))
        .outerjoin(Patient, Communication.patient_id == Patient.id)
        .outerjoin(User, Communication.assigned_to == User.id)
    )

    if status:
        stmt = stmt.where(Communication.status == status)
    if channel:
        stmt = stmt.where(Communication.channel == channel)
    if priority:
        stmt = stmt.where(Communication.priority == priority)

    stmt = stmt.order_by(Communication.created_at.desc())

    # Total count (before pagination)
    count_stmt = select(func.count(Communication.id))
    if status:
        count_stmt = count_stmt.where(Communication.status == status)
    if channel:
        count_stmt = count_stmt.where(Communication.channel == channel)
    if priority:
        count_stmt = count_stmt.where(Communication.priority == priority)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Unread count
    unread = (await db.execute(
        select(func.count(Communication.id)).where(Communication.status == "new")
    )).scalar() or 0

    # Paginate
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    items = [_row_to_response(row[0], row[1], row[2]) for row in rows]

    return CommunicationListResponse(items=items, total=total, unread_count=unread)


async def get_communication_by_id(
    communication_id: uuid.UUID,
    db: AsyncSession,
) -> CommunicationResponse | None:
    stmt = (
        select(Communication, Patient.name.label("patient_name"), User.name.label("assigned_name"))
        .outerjoin(Patient, Communication.patient_id == Patient.id)
        .outerjoin(User, Communication.assigned_to == User.id)
        .where(Communication.id == communication_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if row is None:
        return None
    return _row_to_response(row[0], row[1], row[2])


async def update_communication(
    communication_id: uuid.UUID,
    update: CommunicationUpdate,
    db: AsyncSession,
) -> CommunicationResponse | None:
    result = await db.execute(
        select(Communication).where(Communication.id == communication_id)
    )
    comm = result.scalar_one_or_none()
    if comm is None:
        return None

    if update.status is not None:
        comm.status = update.status
    if update.assigned_to is not None:
        comm.assigned_to = update.assigned_to
    if update.priority is not None:
        comm.priority = update.priority

    await db.commit()
    await db.refresh(comm)
    return await get_communication_by_id(communication_id, db)


async def delete_communication(
    communication_id: uuid.UUID,
    db: AsyncSession,
) -> bool:
    result = await db.execute(
        select(Communication).where(Communication.id == communication_id).limit(1)
    )
    comm = result.scalar_one_or_none()
    if comm is None:
        return False
    await db.execute(sa_delete(Communication).where(Communication.id == communication_id))
    await db.commit()
    return True


async def get_communication_stats(
    db: AsyncSession,
) -> dict[str, int]:
    total = (await db.execute(select(func.count(Communication.id)))).scalar() or 0
    new = (await db.execute(
        select(func.count(Communication.id)).where(Communication.status == "new")
    )).scalar() or 0
    in_progress = (await db.execute(
        select(func.count(Communication.id)).where(Communication.status == "in_progress")
    )).scalar() or 0
    done = (await db.execute(
        select(func.count(Communication.id)).where(Communication.status == "done")
    )).scalar() or 0
    ignored = (await db.execute(
        select(func.count(Communication.id)).where(Communication.status == "ignored")
    )).scalar() or 0

    return {"total": total, "new": new, "in_progress": in_progress, "done": done, "ignored": ignored}
