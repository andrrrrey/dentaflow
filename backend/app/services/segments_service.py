"""Patient segments (saved lists) — analysis, storage and export.

Segments are computed in the background (Celery) and their members are
persisted so the same patients are not re-analysed on every view. The two
"deep" segments (unfinished treatment, missed consultation) are driven by an
AI verdict over each patient's 1Denta visit history, cached per-patient via a
fingerprint so unchanged patients never hit OpenAI twice.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.patient_segment import PatientSegment, PatientSegmentMember

logger = logging.getLogger(__name__)

# All three dynamic lists are produced by a single AI pass over each
# patient's 1Denta visit/service history.
AI_SEGMENT_KEYS = ("unfinished_treatment", "missed_consultation", "hygiene_due")
_BATCH_SIZE = 200
_MAX_HISTORY = 40


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

async def get_segment_by_key(db: AsyncSession, key: str) -> PatientSegment | None:
    result = await db.execute(select(PatientSegment).where(PatientSegment.key == key))
    return result.scalar_one_or_none()


async def list_segments(db: AsyncSession) -> list[PatientSegment]:
    result = await db.execute(
        select(PatientSegment).order_by(PatientSegment.created_at.asc())
    )
    return list(result.scalars().all())


async def reset_segment(db: AsyncSession, key: str) -> None:
    """Force a stuck segment back to ``idle`` so it can be re-run.

    The AI lists share one pass, so resetting any of them resets the whole
    AI group. This lets the UI recover a recompute that got wedged (worker
    restart, lost task) without a manual SQL update.
    """
    seg = await get_segment_by_key(db, key)
    if seg is None:
        return
    keys = list(AI_SEGMENT_KEYS) if seg.kind == "dynamic_ai" else [key]
    await db.execute(
        update(PatientSegment)
        .where(PatientSegment.key.in_(keys))
        .values(status="idle", progress=0, processed=0, error=None)
    )
    await db.commit()


async def _do_not_touch_ids(db: AsyncSession) -> set[uuid.UUID]:
    seg = await get_segment_by_key(db, "do_not_touch")
    if seg is None:
        return set()
    result = await db.execute(
        select(PatientSegmentMember.patient_id).where(
            PatientSegmentMember.segment_id == seg.id
        )
    )
    return {row[0] for row in result.all()}


async def get_segment_members(
    db: AsyncSession, key: str, page: int = 1, limit: int = 50
) -> tuple[list[dict], int]:
    seg = await get_segment_by_key(db, key)
    if seg is None:
        return [], 0

    count_stmt = select(func.count()).select_from(PatientSegmentMember).where(
        PatientSegmentMember.segment_id == seg.id
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Patient, PatientSegmentMember.reason, PatientSegmentMember.added_at)
        .join(PatientSegmentMember, PatientSegmentMember.patient_id == Patient.id)
        .where(PatientSegmentMember.segment_id == seg.id)
        .order_by(PatientSegmentMember.added_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    items = [
        {
            "patient_id": p.id,
            "name": p.name,
            "phone": p.phone,
            "email": p.email,
            "last_visit_at": p.last_visit_at,
            "total_revenue": float(p.total_revenue or 0),
            "reason": reason,
            "added_at": added_at,
        }
        for p, reason, added_at in rows
    ]
    return items, total


# ---------------------------------------------------------------------------
# Helpers for AI analysis
# ---------------------------------------------------------------------------

def _build_history(appts: list[Appointment]) -> list[dict]:
    appts = sorted(
        appts,
        key=lambda a: a.scheduled_at or datetime.min.replace(tzinfo=timezone.utc),
    )[-_MAX_HISTORY:]
    return [
        {
            "external_id": a.external_id,
            "service": a.service,
            "services_data": a.services_data,
            "status": a.status,
            "date": a.scheduled_at.isoformat() if a.scheduled_at else None,
            "doctor": a.doctor_name,
            "comment": a.comment,
        }
        for a in appts
    ]


def _patient_brief(patient: Patient) -> dict:
    return {
        "name": patient.name,
        "total_revenue": float(patient.total_revenue or 0),
        "last_visit_at": patient.last_visit_at.isoformat()
        if patient.last_visit_at
        else None,
    }


def _fingerprint(history: list[dict]) -> str:
    """Stable hash of only the clinically meaningful, non-volatile fields.

    Background 1Denta syncs keep rewriting `doctor`, `comment`, `services_data`
    money fields and `synced_at`, which must NOT invalidate the cached AI
    verdict — otherwise every run re-analyses (and re-pays for) every patient.
    We hash only: visit id, service name, status and date.
    """
    stable = sorted(
        [
            [
                h.get("external_id"),
                (h.get("service") or "").strip().lower(),
                (h.get("status") or "").strip().lower(),
                h.get("date"),
            ]
            for h in history
        ],
        key=lambda x: (str(x[0]), str(x[3])),
    )
    payload = json.dumps(stable, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def store_members(
    db: AsyncSession, seg: PatientSegment, rows: list[tuple[uuid.UUID, str | None]]
) -> None:
    """Replace a segment's members with the freshly computed set."""
    await db.execute(
        delete(PatientSegmentMember).where(PatientSegmentMember.segment_id == seg.id)
    )
    for patient_id, reason in rows:
        db.add(
            PatientSegmentMember(
                segment_id=seg.id,
                patient_id=patient_id,
                reason=(reason or "")[:500] or None,
            )
        )
    seg.member_count = len(rows)
    seg.computed_at = datetime.now(timezone.utc)
    seg.status = "done"
    seg.progress = 100
    seg.error = None


# ---------------------------------------------------------------------------
# Recompute: AI segments (unfinished treatment + missed consultation)
# ---------------------------------------------------------------------------

async def recompute_ai_segments(db: AsyncSession | None = None) -> dict:
    """One pass over all patients producing all three AI-driven segments.

    A single AI verdict per patient feeds `unfinished_treatment`,
    `missed_consultation` and `hygiene_due`, so we only call OpenAI once per
    (changed) patient.

    Uses short-lived DB sessions (one per batch + one for the final write) so a
    long cold run (30-45 min) never holds a single connection long enough to hit
    `pool_recycle` and get stuck. The `db` argument is ignored (kept for
    backwards compatibility).
    """
    from app.services.ai_service import AIService
    from app.services.integrations_service import get_raw_value

    # --- Read settings + init segment rows (short session) ---
    async with async_session_factory() as s:
        api_key = (await get_raw_value(s, "openai_api_key")) or settings.OPENAI_API_KEY
        model = (await get_raw_value(s, "segment_ai_model")) or settings.SEGMENT_AI_MODEL
        try:
            concurrency = int((await get_raw_value(s, "segment_ai_concurrency")) or 0)
        except ValueError:
            concurrency = 0
        if concurrency <= 0:
            concurrency = settings.SEGMENT_AI_CONCURRENCY

        seg_ids: dict[str, uuid.UUID] = {}
        for key in AI_SEGMENT_KEYS:
            seg = await get_segment_by_key(s, key)
            if seg is None:
                raise RuntimeError("AI segments are not seeded")
            seg_ids[key] = seg.id

        exclude = await _do_not_touch_ids(s)
        total = (await s.execute(select(func.count()).select_from(Patient))).scalar() or 0
        await s.execute(
            update(PatientSegment)
            .where(PatientSegment.id.in_(list(seg_ids.values())))
            .values(status="running", total=total, processed=0, progress=0, error=None)
        )
        await s.commit()

    ai = AIService(api_key=api_key or None, model=model)
    sem = asyncio.Semaphore(max(1, concurrency))
    now = datetime.now(timezone.utc)

    rows: dict[str, list[tuple[uuid.UUID, str | None]]] = {
        "unfinished_treatment": [],
        "missed_consultation": [],
        "hygiene_due": [],
    }
    processed = 0
    offset = 0

    # --- Analysis loop: one fresh session per batch ---
    while True:
        async with async_session_factory() as s:
            patients = list(
                (
                    await s.execute(
                        select(Patient).order_by(Patient.created_at.asc())
                        .offset(offset)
                        .limit(_BATCH_SIZE)
                    )
                )
                .scalars()
                .all()
            )
            if not patients:
                break
            offset += len(patients)

            patient_ids = [p.id for p in patients]
            appts = list(
                (
                    await s.execute(
                        select(Appointment).where(Appointment.patient_id.in_(patient_ids))
                    )
                )
                .scalars()
                .all()
            )
            by_patient: dict[uuid.UUID, list[Appointment]] = {}
            for a in appts:
                by_patient.setdefault(a.patient_id, []).append(a)

            async def _verdict(patient: Patient) -> tuple[Patient, dict]:
                history = _build_history(by_patient.get(patient.id, []))
                fp = _fingerprint(history)
                if patient.treatment_ai and patient.treatment_ai_fingerprint == fp:
                    return patient, patient.treatment_ai
                async with sem:
                    verdict = await ai.analyze_treatment_history(
                        _patient_brief(patient), history
                    )
                patient.treatment_ai = verdict
                patient.treatment_ai_fingerprint = fp
                patient.treatment_ai_at = now
                return patient, verdict

            results = await asyncio.gather(*[_verdict(p) for p in patients])

            for patient, verdict in results:
                if patient.id in exclude:
                    continue
                reasoning = verdict.get("reasoning") or ""
                if verdict.get("treatment_plan_completed") is False:
                    rows["unfinished_treatment"].append(
                        (patient.id, reasoning or "План лечения не завершён")
                    )
                if verdict.get("missed_first_consultation") is True:
                    rows["missed_consultation"].append(
                        (patient.id, reasoning or "Консультация не состоялась")
                    )
                if verdict.get("hygiene_due") is True:
                    rows["hygiene_due"].append(
                        (patient.id, reasoning or "Нужна профессиональная гигиена")
                    )

            processed += len(patients)
            await s.execute(
                update(PatientSegment)
                .where(PatientSegment.id.in_(list(seg_ids.values())))
                .values(
                    processed=processed,
                    progress=int(processed / total * 100) if total else 100,
                )
            )
            await s.commit()

    # --- Final write: fresh session, store members + mark done ---
    async with async_session_factory() as s:
        for key in AI_SEGMENT_KEYS:
            seg = await get_segment_by_key(s, key)
            if seg is not None:
                await store_members(s, seg, rows[key])
        await s.commit()

    return {key: len(rows[key]) for key in AI_SEGMENT_KEYS}


# ---------------------------------------------------------------------------
# Manual segment management (do_not_touch)
# ---------------------------------------------------------------------------

async def add_members(
    db: AsyncSession, key: str, patient_ids: list[uuid.UUID]
) -> int:
    seg = await get_segment_by_key(db, key)
    if seg is None or seg.kind != "manual":
        raise ValueError("Segment is not manual")

    existing = {
        row[0]
        for row in (
            await db.execute(
                select(PatientSegmentMember.patient_id).where(
                    PatientSegmentMember.segment_id == seg.id
                )
            )
        ).all()
    }
    added = 0
    for pid in patient_ids:
        if pid in existing:
            continue
        db.add(PatientSegmentMember(segment_id=seg.id, patient_id=pid))
        existing.add(pid)
        added += 1
    seg.member_count = len(existing)
    seg.computed_at = datetime.now(timezone.utc)
    seg.status = "done"
    await db.commit()
    return added


async def remove_member(db: AsyncSession, key: str, patient_id: uuid.UUID) -> None:
    seg = await get_segment_by_key(db, key)
    if seg is None or seg.kind != "manual":
        raise ValueError("Segment is not manual")
    await db.execute(
        delete(PatientSegmentMember).where(
            PatientSegmentMember.segment_id == seg.id,
            PatientSegmentMember.patient_id == patient_id,
        )
    )
    count = (
        await db.execute(
            select(func.count())
            .select_from(PatientSegmentMember)
            .where(PatientSegmentMember.segment_id == seg.id)
        )
    ).scalar() or 0
    seg.member_count = count
    await db.commit()


# ---------------------------------------------------------------------------
# Excel export
# ---------------------------------------------------------------------------

async def export_segment_xlsx(db: AsyncSession, key: str) -> bytes:
    from io import BytesIO

    from openpyxl import Workbook

    seg = await get_segment_by_key(db, key)
    if seg is None:
        raise ValueError("Segment not found")

    stmt = (
        select(Patient, PatientSegmentMember.reason)
        .join(PatientSegmentMember, PatientSegmentMember.patient_id == Patient.id)
        .where(PatientSegmentMember.segment_id == seg.id)
        .order_by(Patient.name.asc())
    )
    rows = (await db.execute(stmt)).all()

    wb = Workbook()
    ws = wb.active
    ws.title = seg.key[:31]
    ws.append(["Имя", "Телефон", "Email", "Последний визит", "Выручка, ₽", "Причина"])
    for p, reason in rows:
        ws.append(
            [
                p.name,
                p.phone or "",
                p.email or "",
                p.last_visit_at.strftime("%d.%m.%Y") if p.last_visit_at else "",
                float(p.total_revenue or 0),
                reason or "",
            ]
        )

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
