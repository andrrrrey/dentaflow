import uuid
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.patient_segment import (
    AddMembersRequest,
    SegmentListResponse,
    SegmentMemberListResponse,
    SegmentMemberResponse,
    SegmentResponse,
)
from app.services import segments_service as svc

router = APIRouter(prefix="/api/v1/patient-segments", tags=["patient-segments"])


@router.get("/", response_model=SegmentListResponse)
async def list_segments(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> SegmentListResponse:
    segments = await svc.list_segments(db)
    return SegmentListResponse(
        items=[SegmentResponse.model_validate(s) for s in segments]
    )


@router.get("/{key}/members", response_model=SegmentMemberListResponse)
async def get_members(
    key: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> SegmentMemberListResponse:
    seg = await svc.get_segment_by_key(db, key)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    items, total = await svc.get_segment_members(db, key, page=page, limit=limit)
    return SegmentMemberListResponse(
        items=[SegmentMemberResponse(**i) for i in items], total=total
    )


@router.post("/{key}/recompute", response_model=SegmentResponse)
async def recompute(
    key: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> SegmentResponse:
    seg = await svc.get_segment_by_key(db, key)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    if seg.kind == "manual":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ручной список не пересчитывается",
        )

    from app.tasks.segments import recompute_segment

    # Mark queued so the UI shows a spinner immediately. For the AI pair both
    # rows move to queued together.
    keys = svc.AI_SEGMENT_KEYS if seg.kind == "dynamic_ai" else (key,)
    for k in keys:
        s = await svc.get_segment_by_key(db, k)
        if s is not None:
            s.status = "queued"
            s.progress = 0
            s.processed = 0
            s.error = None
    await db.commit()
    await db.refresh(seg)

    recompute_segment.delay(key)
    return SegmentResponse.model_validate(seg)


@router.post("/{key}/reset", response_model=SegmentResponse)
async def reset(
    key: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> SegmentResponse:
    seg = await svc.get_segment_by_key(db, key)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    await svc.reset_segment(db, key)
    seg = await svc.get_segment_by_key(db, key)
    return SegmentResponse.model_validate(seg)


@router.get("/{key}/export")
async def export_xlsx(
    key: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    seg = await svc.get_segment_by_key(db, key)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    data = await svc.export_segment_xlsx(db, key)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"{key}_{stamp}.xlsx"
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{key}/members", response_model=SegmentResponse)
async def add_members(
    key: str,
    body: AddMembersRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> SegmentResponse:
    try:
        await svc.add_members(db, key, body.patient_ids)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    seg = await svc.get_segment_by_key(db, key)
    return SegmentResponse.model_validate(seg)


@router.delete("/{key}/members/{patient_id}", response_model=SegmentResponse)
async def delete_member(
    key: str,
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> SegmentResponse:
    try:
        await svc.remove_member(db, key, patient_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    seg = await svc.get_segment_by_key(db, key)
    return SegmentResponse.model_validate(seg)
