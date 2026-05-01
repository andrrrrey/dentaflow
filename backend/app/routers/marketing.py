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
