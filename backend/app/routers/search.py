"""Global search router.

Searches patients, deals and communications by a query string.
Returns grouped results with navigation targets.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.communication import Communication
from app.models.deal import Deal
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.get("/")
async def global_search(
    q: str = Query(..., min_length=2, description="Search query"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Full-text search across patients, deals and communications."""
    term = f"%{q}%"
    limit = 5

    # Patients
    patients_result = await db.execute(
        select(Patient)
        .where(or_(Patient.name.ilike(term), Patient.phone.ilike(term), Patient.email.ilike(term)))
        .limit(limit)
    )
    patients = [
        {
            "id": str(p.id),
            "name": p.name,
            "phone": p.phone,
            "type": "patient",
            "url": f"/patients/{p.id}",
        }
        for p in patients_result.scalars().all()
    ]

    # Deals
    deals_result = await db.execute(
        select(Deal)
        .where(or_(Deal.title.ilike(term), Deal.service.ilike(term)))
        .limit(limit)
    )
    deals = [
        {
            "id": str(d.id),
            "name": d.title,
            "type": "deal",
            "url": "/pipeline",
        }
        for d in deals_result.scalars().all()
    ]

    # Communications
    comms_result = await db.execute(
        select(Communication)
        .where(or_(Communication.content.ilike(term), Communication.phone.ilike(term)))
        .order_by(Communication.created_at.desc())
        .limit(limit)
    )
    comms = [
        {
            "id": str(c.id),
            "name": c.phone or "Неизвестный",
            "preview": (c.content or "")[:80],
            "type": "communication",
            "url": f"/communications",
        }
        for c in comms_result.scalars().all()
    ]

    return {
        "query": q,
        "results": {
            "patients": patients,
            "deals": deals,
            "communications": comms,
        },
        "total": len(patients) + len(deals) + len(comms),
    }
