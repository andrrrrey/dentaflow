"""Scripts router — CRUD + AI analysis + file upload + call transcription."""

from __future__ import annotations

import io
import logging
import uuid

import httpx

logger = logging.getLogger(__name__)
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
    if not ai._api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key не настроен. Перейдите в Настройки и добавьте ключ.",
        )
    analysis = await ai.analyze_script(script.content)
    if isinstance(analysis, dict) and "error" in analysis:
        raise HTTPException(status_code=502, detail="Ошибка при обращении к OpenAI. Проверьте API-ключ.")
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


async def _find_recording_url(call_id: str, db: AsyncSession, svc: NovofonService) -> str:
    """Find a downloadable Novofon recording URL for the given call_id.

    Strategy:
    1. /v1/pbx/record/request/ with call_id → returns api.novofon.com URL (best)
    2. /v1/statistics/pbx/ → extract call IDs → retry /v1/pbx/record/request/ with those
    3. Last resort: use the my.novofon.ru URL from stats (requires auth to download)
    """
    from datetime import timedelta

    from sqlalchemy import select as sa_select

    from app.models.communication import Communication

    # --- Method 1: direct recording request API ---
    url = await svc.get_recording(call_id)
    if url:
        logger.info("Recording URL via record/request (call_id=%s): %.80s", call_id, url)
        return url

    # --- Method 2: statistics API → re-request recording with stats call IDs ---
    result = await db.execute(
        sa_select(Communication).where(Communication.external_id == call_id)
    )
    comm = result.scalar_one_or_none()

    if comm is None:
        logger.warning("Communication not found for call_id=%s; trying stats with wide window", call_id)
        date_from = None
        date_to = None
    else:
        date_from = comm.created_at.replace(tzinfo=None) - timedelta(minutes=10)
        date_to = comm.created_at.replace(tzinfo=None) + timedelta(minutes=10)

    try:
        stats = await svc.get_call_history(date_from=date_from, date_to=date_to)
    except Exception as exc:
        logger.error("Novofon stats API error: %s", exc)
        return ""

    logger.info("Stats returned %d records (call_id=%s, window=%s..%s)",
                len(stats), call_id, date_from, date_to)

    fallback_url = ""
    for stat in stats:
        s_call_id = str(stat.get("call_id") or "")
        s_pbx_call_id = str(stat.get("pbx_call_id") or "")
        s_call_id_with_rec = str(stat.get("call_id_with_rec") or "")
        s_record_url = stat.get("record") or stat.get("recording") or ""

        logger.info(
            "Stat: call_id=%s pbx_call_id=%s call_id_with_rec=%s record=%.80s",
            s_call_id, s_pbx_call_id, s_call_id_with_rec, s_record_url,
        )

        is_match = (
            s_call_id == call_id
            or s_pbx_call_id == call_id
            or comm is not None  # time-window match
        )
        if not is_match:
            continue

        # Try to get a proper api.novofon.com URL using call IDs found in stats.
        # call_id_with_rec is the most reliable identifier for the recording.
        for cid in filter(None, [s_call_id_with_rec, s_call_id, s_pbx_call_id]):
            if cid == call_id:
                continue  # already tried this one above
            url = await svc.get_recording(cid)
            if url:
                logger.info("Recording URL via stats→record/request (cid=%s): %.80s", cid, url)
                return url

        # Save my.novofon.ru URL as last resort (requires browser-session auth)
        if s_record_url and not fallback_url:
            fallback_url = s_record_url

    if fallback_url:
        logger.warning(
            "Using my.novofon.ru fallback URL (may need browser auth): %.80s", fallback_url
        )
    return fallback_url


class TranscribeCallBody(BaseModel):
    call_id: str


@router.post("/transcribe-audio")
async def transcribe_audio_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Transcribe an uploaded audio file (mp3/wav/ogg/m4a) using OpenAI Whisper."""
    content = await file.read()
    if len(content) < 1000:
        raise HTTPException(status_code=400, detail="Файл слишком мал или пустой")

    ai = AIService()
    if not ai._api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key не настроен в системе")

    filename = file.filename or "recording.mp3"
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=ai._api_key)
        buf = io.BytesIO(content)
        buf.name = filename
        result = await client.audio.transcriptions.create(
            model="whisper-1",
            file=buf,
            language="ru",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка транскрибации: {exc}")

    return {"transcript": result.text}


@router.post("/transcribe-call")
async def transcribe_call(
    body: TranscribeCallBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Download a Novofon call recording and transcribe it with Whisper."""
    from app.config import settings as app_settings

    api_key = (await get_raw_value(db, "novofon_api_key")) or app_settings.NOVOFON_API_KEY
    api_secret = (await get_raw_value(db, "novofon_webhook_secret")) or app_settings.NOVOFON_WEBHOOK_SECRET

    logger.info(
        "transcribe_call: call_id=%s api_key=%s api_secret=%s",
        body.call_id,
        (api_key[:8] + "...") if api_key else "MISSING",
        "SET" if api_secret else "MISSING",
    )

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "API-ключ или секрет Новофон не настроены. "
                "Перейдите в Настройки → Интеграции → Новофон и сохраните ключи."
            ),
        )

    svc = NovofonService(api_key=api_key, api_secret=api_secret)
    url = await _find_recording_url(body.call_id, db, svc)

    if not url:
        raise HTTPException(
            status_code=404,
            detail=(
                "Не удалось найти запись для этого звонка в Novofon. "
                "Проверьте: включена ли запись разговоров в настройках Novofon, "
                "и есть ли у API-ключа доступ к статистике и записям."
            ),
        )

    logger.info("Downloading Novofon recording for call_id=%s url=%.80s", body.call_id, url)

    audio_bytes = await svc.download_recording_bytes(url)
    if not audio_bytes:
        logger.error("Failed to download recording for call_id=%s url=%.80s", body.call_id, url)
        raise HTTPException(
            status_code=502,
            detail=(
                "Не удалось скачать файл записи из Новофон. "
                "Убедитесь, что у API-ключа есть доступ к записям, "
                "и что запись не была удалена."
            ),
        )

    ai = AIService()
    if not ai._api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key не настроен")

    try:
        from openai import AsyncOpenAI
        openai_client = AsyncOpenAI(api_key=ai._api_key)
        audio_buffer = io.BytesIO(audio_bytes)
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
    if not ai._api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key не настроен. Перейдите в Настройки и добавьте ключ.",
        )
    comparison = await ai.compare_call_with_script(
        transcript=body.transcript,
        script_content=script.content,
    )
    if isinstance(comparison, dict) and "error" in comparison:
        raise HTTPException(status_code=502, detail="Ошибка при обращении к OpenAI. Проверьте API-ключ.")
    return {"script_id": body.script_id, "comparison": comparison}
