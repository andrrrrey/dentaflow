"""Celery tasks for AI-powered analysis of communications and patients.

These tasks are triggered on-demand (e.g. after a new communication
arrives) rather than on a schedule.
"""

from __future__ import annotations

import asyncio
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


async def _analyze_communication_async(comm_id: str) -> dict:
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.communication import Communication
    from app.services.ai_service import AIService
    from app.services.realtime import realtime

    ai = AIService()

    async with async_session_factory() as session:
        stmt = select(Communication).where(
            Communication.id == comm_id
        )
        result = await session.execute(stmt)
        comm = result.scalar_one_or_none()

        if comm is None:
            logger.warning("Communication %s not found for AI analysis", comm_id)
            return {"status": "not_found"}

        comm_data = {
            "channel": comm.channel,
            "direction": comm.direction,
            "type": comm.type,
            "content": comm.content,
            "priority": comm.priority,
        }

        analysis = await ai.prioritize_communication(comm_data)

        # Update communication with AI results
        if "priority" in analysis:
            comm.priority = analysis["priority"]
        if "tags" in analysis:
            comm.ai_tags = analysis["tags"]
        if "summary" in analysis:
            comm.ai_summary = analysis["summary"]
        if "next_action" in analysis:
            comm.ai_next_action = analysis["next_action"]

        await session.commit()

    # Notify connected clients
    await realtime.publish("communication_updated", {
        "id": str(comm_id),
        "priority": analysis.get("priority"),
        "ai_tags": analysis.get("tags"),
    })

    return {"status": "ok", "comm_id": comm_id, "analysis": analysis}


async def _analyze_patient_async(patient_id: str) -> dict:
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.patient import Patient
    from app.models.communication import Communication
    from app.services.ai_service import AIService

    ai = AIService()

    async with async_session_factory() as session:
        # Fetch patient
        stmt = select(Patient).where(Patient.id == patient_id)
        result = await session.execute(stmt)
        patient = result.scalar_one_or_none()

        if patient is None:
            logger.warning("Patient %s not found for AI analysis", patient_id)
            return {"status": "not_found"}

        patient_data = {
            "name": patient.name,
            "phone": patient.phone,
            "is_new_patient": patient.is_new_patient,
            "total_revenue": float(patient.total_revenue) if patient.total_revenue else 0,
            "last_visit_at": patient.last_visit_at.isoformat() if patient.last_visit_at else None,
            "tags": patient.tags or [],
        }

        # Fetch recent communications
        comms_stmt = (
            select(Communication)
            .where(Communication.patient_id == patient_id)
            .order_by(Communication.created_at.desc())
            .limit(20)
        )
        comms_result = await session.execute(comms_stmt)
        comms = comms_result.scalars().all()

        history = [
            {
                "channel": c.channel,
                "type": c.type,
                "content": c.content[:200] if c.content else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in comms
        ]

        analysis = await ai.analyze_patient(patient_data, history)

        # Update patient LTV score if returned
        if "ltv_score" in analysis:
            patient.ltv_score = analysis["ltv_score"]
        elif "return_probability" in analysis:
            patient.ltv_score = analysis["return_probability"]

        await session.commit()

    return {"status": "ok", "patient_id": patient_id, "analysis": analysis}


@celery_app.task(name="app.tasks.ai_analysis.analyze_new_communication")
def analyze_new_communication(comm_id: str):
    """Run AI prioritisation and tagging on a communication."""
    try:
        result = _run_async(_analyze_communication_async(comm_id))
        logger.info("AI analysis for communication %s: %s", comm_id, result.get("status"))
        return result
    except Exception:
        logger.exception("analyze_new_communication failed for %s", comm_id)
        return {"status": "error", "comm_id": comm_id}


@celery_app.task(name="app.tasks.ai_analysis.analyze_patient")
def analyze_patient(patient_id: str):
    """Run full AI patient analysis (return probability, barriers, next action)."""
    try:
        result = _run_async(_analyze_patient_async(patient_id))
        logger.info("AI analysis for patient %s: %s", patient_id, result.get("status"))
        return result
    except Exception:
        logger.exception("analyze_patient failed for %s", patient_id)
        return {"status": "error", "patient_id": patient_id}
