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
        now = datetime.now(timezone.utc)

        existing_codes = {
            row[0] for row in (await db.execute(select(GiftCertificate.code))).all()
        }
        existing_discount_names = {
            row[0] for row in (await db.execute(select(Discount.name))).all()
        }

        # ── Discounts from dedicated endpoint ──────────────────────────────
        try:
            raw_discounts = await svc.get_discounts()
            for d in raw_discounts:
                name = (d.get("name") or d.get("title") or "").strip()
                if not name or name in existing_discount_names:
                    continue
                value_raw = d.get("value") or d.get("percent") or d.get("amount") or d.get("size") or 0
                try:
                    value = float(value_raw)
                except (TypeError, ValueError):
                    value = 0.0
                dtype = "percent" if value <= 100 else "fixed"
                discount = Discount(
                    name=name,
                    type=dtype,
                    value=value,
                    is_active=bool(d.get("active", d.get("isActive", True))),
                    description=f"Импорт из 1Denta (ID: {d.get('id', '')})",
                )
                db.add(discount)
                existing_discount_names.add(name)
                synced_discounts += 1
        except Exception as e:
            logger.warning("Failed to fetch discounts from 1Denta: %s", e)

        # ── Certificates from dedicated endpoint ───────────────────────────
        try:
            raw_certs = await svc.get_certificates()
            for c in raw_certs:
                cert_id = str(c.get("id", ""))
                code = f"1D-CERT-{cert_id}" if cert_id else None
                if not code or code in existing_codes:
                    continue
                amount_raw = c.get("amount") or c.get("nominal") or c.get("value") or c.get("sum") or 0
                try:
                    amount = float(amount_raw)
                except (TypeError, ValueError):
                    amount = 0.0
                recipient = c.get("clientName") or c.get("name") or c.get("recipient") or None
                cert = GiftCertificate(
                    code=code,
                    amount=amount,
                    remaining_amount=float(c.get("remaining") or c.get("remainingAmount") or amount),
                    recipient_name=recipient,
                    valid_from=now.date(),
                    valid_to=(now + timedelta(days=365)).date(),
                    note=f"Импорт из 1Denta (ID: {cert_id})",
                    status="active",
                )
                db.add(cert)
                existing_codes.add(code)
                synced_certs += 1
        except Exception as e:
            logger.warning("Failed to fetch certificates from 1Denta: %s", e)

        # ── Fallback: scan services for discount/cert keywords ─────────────
        if synced_discounts == 0 and synced_certs == 0:
            try:
                services = await svc.get_services()
                for s in services:
                    title = (s.get("title") or s.get("name") or "").strip()
                    if not title:
                        continue
                    title_lower = title.lower()
                    price_range = s.get("price", {}).get("range", []) if isinstance(s.get("price"), dict) else []
                    price = float(price_range[0]) if price_range else float(s.get("price") or 0)

                    if "сертификат" in title_lower or "certificate" in title_lower:
                        code = f"1D-SVC-CERT-{s.get('id', '')}"
                        if code not in existing_codes:
                            cert = GiftCertificate(
                                code=code, amount=price, remaining_amount=price,
                                recipient_name=None,
                                valid_from=now.date(),
                                valid_to=(now + timedelta(days=365)).date(),
                                note=f"Импорт из 1Denta: {title}", status="active",
                            )
                            db.add(cert)
                            existing_codes.add(code)
                            synced_certs += 1
                    elif any(k in title_lower for k in ("скидк", "бонус", "акци")):
                        if title not in existing_discount_names:
                            discount = Discount(
                                name=title,
                                type="percent" if price < 100 else "fixed",
                                value=price, is_active=True,
                                description=f"Импорт из 1Denta (ID: {s.get('id', '')})",
                            )
                            db.add(discount)
                            existing_discount_names.add(title)
                            synced_discounts += 1
            except Exception as e:
                logger.warning("Fallback service scan for marketing sync failed: %s", e)

        await db.flush()

    except Exception as e:
        logger.exception("1Denta marketing sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

    return {
        "synced_certificates": synced_certs,
        "synced_discounts": synced_discounts,
        "message": "Синхронизация завершена",
    }
