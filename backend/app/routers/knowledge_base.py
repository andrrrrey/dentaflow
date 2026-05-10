"""Knowledge base file management router.

Supports uploading TXT / MD files as plain text and basic PDF extraction.
Files are stored as text in the DB so the AI bot can retrieve them at query time.
"""

from __future__ import annotations

import logging
import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.knowledge_base import KnowledgeBaseFile
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/knowledge-base", tags=["knowledge-base"])

_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_TYPES = {
    "text/plain", "text/markdown",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from uploaded file bytes."""
    lower = filename.lower()

    if lower.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace")

    if lower.endswith(".pdf"):
        try:
            import pypdf  # type: ignore

            reader = pypdf.PdfReader(BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages).strip()
        except ImportError:
            raise HTTPException(
                status_code=422,
                detail="Для обработки PDF установите pypdf: pip install pypdf",
            )
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Ошибка чтения PDF: {exc}")

    if lower.endswith(".docx"):
        try:
            import docx  # type: ignore

            doc = docx.Document(BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            raise HTTPException(
                status_code=422,
                detail="Для обработки DOCX установите python-docx: pip install python-docx",
            )
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Ошибка чтения DOCX: {exc}")

    # Fallback: try decode as utf-8
    return data.decode("utf-8", errors="replace")


@router.get("/")
async def list_files(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        select(
            KnowledgeBaseFile.id,
            KnowledgeBaseFile.filename,
            KnowledgeBaseFile.size_bytes,
            KnowledgeBaseFile.created_at,
        ).order_by(KnowledgeBaseFile.created_at.desc())
    )
    rows = result.all()
    return {
        "files": [
            {
                "id": str(r.id),
                "filename": r.filename,
                "size_bytes": r.size_bytes,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    data = await file.read()
    if len(data) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 10 МБ)")
    if not data:
        raise HTTPException(status_code=422, detail="Файл пустой")

    filename = file.filename or "document.txt"
    text = _extract_text(filename, data)
    if not text.strip():
        raise HTTPException(status_code=422, detail="Не удалось извлечь текст из файла")

    kb_file = KnowledgeBaseFile(
        id=uuid.uuid4(),
        filename=filename,
        content=text,
        size_bytes=len(data),
    )
    db.add(kb_file)
    await db.commit()

    logger.info("KB file uploaded: %s (%d bytes)", filename, len(data))
    return {"id": str(kb_file.id), "filename": filename, "size_bytes": len(data)}


@router.delete("/{file_id}")
async def delete_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        select(KnowledgeBaseFile).where(KnowledgeBaseFile.id == file_id)
    )
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        raise HTTPException(status_code=404, detail="Файл не найден")

    await db.execute(delete(KnowledgeBaseFile).where(KnowledgeBaseFile.id == file_id))
    await db.commit()
    logger.info("KB file deleted: %s", file_id)
    return {"ok": True}


async def get_kb_context(db: AsyncSession) -> str:
    """Return concatenated KB content for injection into AI prompts."""
    result = await db.execute(
        select(KnowledgeBaseFile.filename, KnowledgeBaseFile.content)
    )
    rows = result.all()
    if not rows:
        return ""
    parts = []
    for r in rows:
        parts.append(f"=== {r.filename} ===\n{r.content}")
    return "\n\n".join(parts)
