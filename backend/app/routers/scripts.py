"""Scripts router — CRUD + AI analysis + file upload + call transcription."""

from __future__ import annotations

import io
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.script import Script
from app.models.user import User
from app.services.ai_service import AIService
from app.services.integrations_service import get_raw_value
from app.services.novofon import NovofonService

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


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_script_file(
    name: str = Form(...),
    category: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Create a script by uploading a .txt, .pdf, or .docx file."""
    filename = (file.filename or "").lower()
    content_bytes = await file.read()
    content = ""

    if filename.endswith(".txt"):
        content = content_bytes.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content_bytes))
        content = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif filename.endswith((".docx", ".doc")):
        from docx import Document
        doc = Document(io.BytesIO(content_bytes))
        content = "\n".join(para.text for para in doc.paragraphs)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .txt, .pdf or .docx")

    content = content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Could not extract text from the file")

    script = Script(name=name, content=content, category=category)
    db.add(script)
    await db.flush()
    return {
        "id": str(script.id),
        "name": script.name,
        "content": script.content,
        "category": script.category,
        "created_at": script.created_at.isoformat(),
    }


class TranscribeCallBody(BaseModel):
    call_id: str


@router.post("/transcribe-call")
async def transcribe_call(
    body: TranscribeCallBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Download a Novofon call recording and transcribe it with Whisper."""
    api_key = await get_raw_value(db, "novofon_api_key")
    api_secret = await get_raw_value(db, "novofon_webhook_secret")
    svc = NovofonService(api_key=api_key or None, api_secret=api_secret or None)
    url = await svc.get_recording(body.call_id)

    if not url:
        raise HTTPException(status_code=404, detail="Recording not found")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось скачать запись звонка: HTTP {exc.response.status_code}",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка при получении записи: {exc}")

    if len(resp.content) < 1000:
        raise HTTPException(status_code=404, detail="Запись звонка не найдена или пуста")

    ai = AIService()
    if not ai.api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key не настроен")

    try:
        from openai import AsyncOpenAI
        openai_client = AsyncOpenAI(api_key=ai.api_key)
        audio_buffer = io.BytesIO(resp.content)
        audio_buffer.name = f"{body.call_id}.mp3"
        result = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_buffer,
            language="ru",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка транскрибации: {exc}")

    return {"call_id": body.call_id, "transcript": result.text}


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
