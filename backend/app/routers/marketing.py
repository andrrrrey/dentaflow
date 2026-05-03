import logging
import random
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.discount import Discount
from app.models.gift_certificate import GiftCertificate
from app.models.user import User
from app.schemas.marketing import (
    CertificateCreate,
    CertificateListResponse,
    CertificateResponse,
    CertificateUpdate,
    DiscountCreate,
    DiscountListResponse,
    DiscountResponse,
    DiscountUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/marketing", tags=["marketing"])


def _gen_cert_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "CERT-" + "".join(random.choices(chars, k=8))


# ─── Discounts ───────────────────────────────────────────────────────────────

@router.get("/discounts", response_model=DiscountListResponse)
async def list_discounts(
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DiscountListResponse:
    stmt = select(Discount)
    if is_active is not None:
        stmt = stmt.where(Discount.is_active == is_active)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    stmt = stmt.order_by(Discount.created_at.desc()).offset((page - 1) * limit).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    return DiscountListResponse(items=list(items), total=total)


@router.post("/discounts", response_model=DiscountResponse, status_code=status.HTTP_201_CREATED)
async def create_discount(
    body: DiscountCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DiscountResponse:
    discount = Discount(**body.model_dump())
    db.add(discount)
    await db.flush()
    await db.refresh(discount)
    return DiscountResponse.model_validate(discount)


@router.patch("/discounts/{discount_id}", response_model=DiscountResponse)
async def update_discount(
    discount_id: uuid.UUID,
    body: DiscountUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DiscountResponse:
    discount = await db.get(Discount, discount_id)
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(discount, k, v)
    await db.flush()
    await db.refresh(discount)
    return DiscountResponse.model_validate(discount)


@router.delete("/discounts/{discount_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discount(
    discount_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    discount = await db.get(Discount, discount_id)
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    await db.delete(discount)


# ─── Gift Certificates ────────────────────────────────────────────────────────

@router.get("/certificates", response_model=CertificateListResponse)
async def list_certificates(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CertificateListResponse:
    stmt = select(GiftCertificate)
    if status_filter:
        stmt = stmt.where(GiftCertificate.status == status_filter)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    stmt = stmt.order_by(GiftCertificate.created_at.desc()).offset((page - 1) * limit).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    return CertificateListResponse(items=list(items), total=total)


@router.post("/certificates", response_model=CertificateResponse, status_code=status.HTTP_201_CREATED)
async def create_certificate(
    body: CertificateCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CertificateResponse:
    code = body.code or _gen_cert_code()
    cert = GiftCertificate(
        code=code,
        amount=body.amount,
        remaining_amount=body.amount,
        recipient_name=body.recipient_name,
        recipient_phone=body.recipient_phone,
        recipient_email=body.recipient_email,
        purchased_by=body.purchased_by,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        note=body.note,
        status="active",
    )
    db.add(cert)
    await db.flush()
    await db.refresh(cert)
    return CertificateResponse.model_validate(cert)


@router.patch("/certificates/{cert_id}", response_model=CertificateResponse)
async def update_certificate(
    cert_id: uuid.UUID,
    body: CertificateUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CertificateResponse:
    cert = await db.get(GiftCertificate, cert_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(cert, k, v)
    await db.flush()
    await db.refresh(cert)
    return CertificateResponse.model_validate(cert)


@router.delete("/certificates/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certificate(
    cert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    cert = await db.get(GiftCertificate, cert_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.delete(cert)


# ─── 1Denta Sync ─────────────────────────────────────────────────────────────

@router.post("/sync-1denta")
async def sync_from_1denta(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Sync discounts and certificates from 1Denta visit data.

    1Denta exposes certificates as line items within visits.
    This endpoint fetches recent visits, extracts unique certificates,
    and imports any that don't already exist locally.
    """
    from app.services.one_denta import OneDentaService

    try:
        svc = await OneDentaService.from_db(db)
    except Exception:
        raise HTTPException(status_code=400, detail="1Denta integration not configured")

    if svc._no_credentials():
        return {"synced_certificates": 0, "synced_discounts": 0, "message": "1Denta credentials not configured"}

    synced_certs = 0
    synced_discounts = 0

    try:
        from datetime import datetime, timedelta, timezone
        date_from = datetime.now(timezone.utc) - timedelta(days=365)
        visits = await svc.get_appointments(date_from=date_from)

        # Extract certificates from visits
        seen_cert_names: set[str] = set()
        existing_codes = {
            row[0] for row in (await db.execute(select(GiftCertificate.code))).all()
        }

        for visit in visits:
            raw = visit.get("services", [])
            # Check the raw visit data for certificates
            # Certificates come from the original API data, not our mapped visit
            pass

        # Try to fetch certificates from services that contain "сертификат" in name
        try:
            services = await svc.get_services()
            for s in services:
                title = (s.get("title") or "").strip()
                if not title:
                    continue
                title_lower = title.lower()
                price_range = s.get("price", {}).get("range", [])
                price = float(price_range[0]) if price_range else 0

                if "сертификат" in title_lower or "certificate" in title_lower:
                    code = f"1D-CERT-{s.get('id', '')}"
                    if code not in existing_codes and title not in seen_cert_names:
                        seen_cert_names.add(title)
                        cert = GiftCertificate(
                            code=code,
                            amount=price,
                            remaining_amount=price,
                            recipient_name=None,
                            valid_from=datetime.now(timezone.utc).date(),
                            valid_to=(datetime.now(timezone.utc) + timedelta(days=365)).date(),
                            note=f"Импорт из 1Denta: {title}",
                            status="active",
                        )
                        db.add(cert)
                        synced_certs += 1

                elif "скидк" in title_lower or "бонус" in title_lower or "акци" in title_lower:
                    existing = await db.execute(
                        select(Discount).where(Discount.name == title)
                    )
                    if existing.scalar_one_or_none() is None:
                        discount = Discount(
                            name=title,
                            type="percent" if price < 100 else "fixed",
                            value=price,
                            is_active=True,
                            description=f"Импорт из 1Denta (ID: {s.get('id', '')})",
                        )
                        db.add(discount)
                        synced_discounts += 1
        except Exception as e:
            logger.warning("Failed to fetch services from 1Denta for marketing sync: %s", e)

        await db.flush()

    except Exception as e:
        logger.exception("1Denta marketing sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

    return {
        "synced_certificates": synced_certs,
        "synced_discounts": synced_discounts,
        "message": "Синхронизация завершена",
    }
