"""Scripts router — CRUD + AI analysis."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.script import Script
from app.models.user import User
from app.services.ai_service import AIService

router = APIRouter(prefix="/api/v1/scripts", tags=["scripts"])


class ScriptCreate(BaseModel):
    name: str
    content: str
    category: str | None = None


class ScriptUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    category: str | None = None


class CompareCallBody(BaseModel):
    script_id: str
    transcript: str


@router.get("/")
async def list_scripts(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(Script).order_by(Script.created_at.desc()))
    scripts = result.scalars().all()
    return {
        "scripts": [
            {
                "id": str(s.id),
                "name": s.name,
                "content": s.content,
                "category": s.category,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
            }
            for s in scripts
        ]
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_script(
    body: ScriptCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    script = Script(name=body.name, content=body.content, category=body.category)
    db.add(script)
    await db.flush()
    return {
        "id": str(script.id),
        "name": script.name,
        "content": script.content,
        "category": script.category,
        "created_at": script.created_at.isoformat(),
    }


@router.put("/{script_id}")
async def update_script(
    script_id: uuid.UUID,
    body: ScriptUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    script = (await db.execute(
        select(Script).where(Script.id == script_id)
    )).scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    if body.name is not None:
        script.name = body.name
    if body.content is not None:
        script.content = body.content
    if body.category is not None:
        script.category = body.category

    await db.flush()
    return {
        "id": str(script.id),
        "name": script.name,
        "content": script.content,
        "category": script.category,
    }


@router.delete("/{script_id}", status_code=status.HTTP_200_OK)
async def delete_script(
    script_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    script = (await db.execute(
        select(Script).where(Script.id == script_id)
    )).scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    await db.delete(script)
    return {"ok": True}


@router.post("/{script_id}/analyze")
async def analyze_script(
    script_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    script = (await db.execute(
        select(Script).where(Script.id == script_id)
    )).scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    ai = AIService()
    analysis = await ai.analyze_script(script.content)
    return {"script_id": str(script_id), "analysis": analysis}


@router.post("/compare-call")
async def compare_call_with_script(
    body: CompareCallBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    script = (await db.execute(
        select(Script).where(Script.id == uuid.UUID(body.script_id))
    )).scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    ai = AIService()
    comparison = await ai.compare_call_with_script(
        transcript=body.transcript,
        script_content=script.content,
    )
    return {"script_id": body.script_id, "comparison": comparison}
