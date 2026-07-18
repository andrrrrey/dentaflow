"""Патиентская программа лояльности — баллы, реферальные коды, отзывы.

Хранит настройки JSON-блобом в integration_settings (ключ ``loyalty_config``),
ведёт леджер ``loyalty_transactions`` и кэширует сумму в ``patients.bonus_balance``.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import string
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration_setting import IntegrationSetting
from app.models.loyalty_transaction import LoyaltyTransaction
from app.models.patient import Patient
from app.models.patient_review import PatientReview
from app.schemas.loyalty import (
    LoyaltyConfig,
    LoyaltyStats,
    RatingEntry,
    ReviewEntry,
)

logger = logging.getLogger(__name__)

_SETTINGS_KEY = "loyalty_config"
_CODE_ALPHABET = string.ascii_uppercase + string.digits

# static/reviews/ (backend/static — уже смонтирован в main.py как /static)
REVIEWS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "reviews"
)
ALLOWED_REVIEW_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_REVIEW_SIZE = 10 * 1024 * 1024


def save_review_image(contents: bytes, ext: str = ".jpg") -> str:
    """Сохранить байты изображения отзыва на диск, вернуть публичный /static URL."""
    ext = (ext or ".jpg").lower()
    if ext not in ALLOWED_REVIEW_EXTENSIONS:
        ext = ".jpg"
    os.makedirs(REVIEWS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(REVIEWS_DIR, filename), "wb") as f:
        f.write(contents)
    return f"/static/reviews/{filename}"


# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------

async def get_config(db: AsyncSession) -> LoyaltyConfig:
    row = await db.execute(
        select(IntegrationSetting).where(IntegrationSetting.key == _SETTINGS_KEY)
    )
    setting = row.scalar_one_or_none()
    if setting and setting.value:
        try:
            data = json.loads(setting.value)
            return LoyaltyConfig(**data)
        except (json.JSONDecodeError, TypeError, ValueError):
            logger.warning("loyalty: invalid config JSON, falling back to defaults")
    return LoyaltyConfig()


async def save_config(db: AsyncSession, config: LoyaltyConfig) -> LoyaltyConfig:
    row = await db.execute(
        select(IntegrationSetting).where(IntegrationSetting.key == _SETTINGS_KEY)
    )
    setting = row.scalar_one_or_none()
    value = json.dumps(config.model_dump())
    if setting:
        setting.value = value
    else:
        db.add(IntegrationSetting(key=_SETTINGS_KEY, value=value))
    await db.commit()
    return config


# ------------------------------------------------------------------
# Points ledger
# ------------------------------------------------------------------

async def award_points(
    db: AsyncSession,
    patient_id: uuid.UUID,
    action_type: str,
    points: int,
    description: str | None = None,
    *,
    source_appointment_id: uuid.UUID | None = None,
    review_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
    commit: bool = True,
) -> LoyaltyTransaction:
    """Записать начисление/списание в леджер и обновить кэш баланса пациента."""
    entry = LoyaltyTransaction(
        patient_id=patient_id,
        action_type=action_type,
        points=points,
        description=description,
        source_appointment_id=source_appointment_id,
        review_id=review_id,
        created_by=created_by,
    )
    db.add(entry)

    patient = await db.get(Patient, patient_id)
    if patient is not None:
        patient.bonus_balance = int(patient.bonus_balance or 0) + points

    if commit:
        await db.commit()
        await db.refresh(entry)
    else:
        await db.flush()
    return entry


async def accrue_for_appointment(db: AsyncSession, appointment) -> LoyaltyTransaction | None:
    """Идемпотентно начислить баллы за оплаченный завершённый визит.

    Безопасно вызывать после каждого апсёрта визита из 1Denta: повторный вызов
    для того же визита ничего не делает (проверка по source_appointment_id).
    Не коммитит — рассчитан на вызов внутри существующей транзакции синка.
    """
    if appointment is None or appointment.patient_id is None:
        return None
    if (appointment.status or "").lower() != "completed":
        return None

    pay = appointment.payment_amount
    if pay is None or float(pay) <= 0:
        return None

    config = await get_config(db)
    if not config.enabled:
        return None

    # Идемпотентность: уже начисляли за этот визит?
    exists = await db.execute(
        select(LoyaltyTransaction.id).where(
            LoyaltyTransaction.source_appointment_id == appointment.id
        ).limit(1)
    )
    if exists.scalar_one_or_none() is not None:
        return None

    unit = config.purchase_rate_rubles or 100
    points = int(float(pay) // unit) * config.points_per_purchase_unit
    if points <= 0:
        return None

    return await award_points(
        db,
        patient_id=appointment.patient_id,
        action_type="purchase",
        points=points,
        description=f"Начисление за оплату визита ({float(pay):.0f} ₽)",
        source_appointment_id=appointment.id,
        commit=False,
    )


async def get_patient_ledger(
    db: AsyncSession, patient_id: uuid.UUID, limit: int = 100
) -> list[LoyaltyTransaction]:
    result = await db.execute(
        select(LoyaltyTransaction)
        .where(LoyaltyTransaction.patient_id == patient_id)
        .order_by(LoyaltyTransaction.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ------------------------------------------------------------------
# Referral codes
# ------------------------------------------------------------------

def _gen_code(length: int = 8) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


async def get_or_create_referral_code(db: AsyncSession, patient_id: uuid.UUID) -> str | None:
    patient = await db.get(Patient, patient_id)
    if patient is None:
        return None
    if patient.referral_code:
        return patient.referral_code

    for _ in range(10):
        code = _gen_code()
        clash = await db.execute(
            select(Patient.id).where(Patient.referral_code == code).limit(1)
        )
        if clash.scalar_one_or_none() is None:
            patient.referral_code = code
            await db.commit()
            return code
    logger.error("loyalty: could not generate unique referral code")
    return None


async def find_patient_by_referral_code(db: AsyncSession, code: str) -> Patient | None:
    result = await db.execute(
        select(Patient).where(Patient.referral_code == code.strip().upper()).limit(1)
    )
    return result.scalars().first()


# ------------------------------------------------------------------
# Reviews
# ------------------------------------------------------------------

async def create_review(
    db: AsyncSession,
    patient_id: uuid.UUID | None,
    image_url: str,
    channel: str | None = None,
) -> PatientReview:
    review = PatientReview(
        patient_id=patient_id,
        image_url=image_url,
        channel=channel,
        status="pending",
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


async def list_reviews(db: AsyncSession, status: str | None = None) -> list[ReviewEntry]:
    stmt = select(PatientReview).order_by(PatientReview.created_at.desc())
    if status:
        stmt = stmt.where(PatientReview.status == status)
    rows = list((await db.execute(stmt)).scalars().all())

    patient_ids = [r.patient_id for r in rows if r.patient_id]
    names: dict[uuid.UUID, str] = {}
    if patient_ids:
        name_rows = await db.execute(
            select(Patient.id, Patient.name).where(Patient.id.in_(patient_ids))
        )
        names = {row.id: row.name for row in name_rows.all()}

    return [
        ReviewEntry(
            id=r.id,
            patient_id=r.patient_id,
            patient_name=names.get(r.patient_id) if r.patient_id else None,
            channel=r.channel,
            image_url=r.image_url,
            status=r.status,
            points_awarded=r.points_awarded,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        )
        for r in rows
    ]


async def approve_review(
    db: AsyncSession,
    review_id: uuid.UUID,
    points: int,
    reviewed_by: uuid.UUID | None = None,
) -> PatientReview | None:
    review = await db.get(PatientReview, review_id)
    if review is None or review.status == "approved":
        return review
    review.status = "approved"
    review.points_awarded = points
    review.reviewed_by = reviewed_by
    review.reviewed_at = datetime.now(timezone.utc)

    if review.patient_id and points > 0:
        await award_points(
            db,
            patient_id=review.patient_id,
            action_type="review",
            points=points,
            description="Начисление за отзыв",
            review_id=review.id,
            created_by=reviewed_by,
            commit=False,
        )
    await db.commit()
    await db.refresh(review)
    return review


async def reject_review(
    db: AsyncSession,
    review_id: uuid.UUID,
    reviewed_by: uuid.UUID | None = None,
) -> PatientReview | None:
    review = await db.get(PatientReview, review_id)
    if review is None:
        return None
    review.status = "rejected"
    review.reviewed_by = reviewed_by
    review.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(review)
    return review


# ------------------------------------------------------------------
# Stats / ratings
# ------------------------------------------------------------------

async def get_stats(db: AsyncSession) -> LoyaltyStats:
    # Points by action
    by_action_rows = await db.execute(
        select(
            LoyaltyTransaction.action_type,
            func.sum(LoyaltyTransaction.points),
        ).group_by(LoyaltyTransaction.action_type)
    )
    points_by_action = {row[0]: int(row[1] or 0) for row in by_action_rows.all()}
    total_points = sum(points_by_action.values())

    # Referrals count (number of referral transactions)
    total_referrals = (
        await db.execute(
            select(func.count(LoyaltyTransaction.id)).where(
                LoyaltyTransaction.action_type == "referral"
            )
        )
    ).scalar_one() or 0

    # Reviews
    pending_reviews = (
        await db.execute(
            select(func.count(PatientReview.id)).where(PatientReview.status == "pending")
        )
    ).scalar_one() or 0
    approved_reviews = (
        await db.execute(
            select(func.count(PatientReview.id)).where(PatientReview.status == "approved")
        )
    ).scalar_one() or 0

    active_patients = (
        await db.execute(
            select(func.count(Patient.id)).where(Patient.bonus_balance > 0)
        )
    ).scalar_one() or 0

    # Top by balance
    top_balance_rows = await db.execute(
        select(Patient.id, Patient.name, Patient.bonus_balance)
        .where(Patient.bonus_balance > 0)
        .order_by(Patient.bonus_balance.desc())
        .limit(10)
    )
    top_by_balance = [
        RatingEntry(patient_id=row.id, name=row.name, value=int(row.bonus_balance or 0), rank=i + 1)
        for i, row in enumerate(top_balance_rows.all())
    ]

    # Top by referrals (count of referral transactions per patient)
    top_ref_rows = await db.execute(
        select(
            LoyaltyTransaction.patient_id,
            func.count(LoyaltyTransaction.id).label("cnt"),
        )
        .where(LoyaltyTransaction.action_type == "referral")
        .group_by(LoyaltyTransaction.patient_id)
        .order_by(func.count(LoyaltyTransaction.id).desc())
        .limit(10)
    )
    ref_rows = top_ref_rows.all()
    ref_names: dict[uuid.UUID, str] = {}
    if ref_rows:
        name_rows = await db.execute(
            select(Patient.id, Patient.name).where(
                Patient.id.in_([r.patient_id for r in ref_rows])
            )
        )
        ref_names = {row.id: row.name for row in name_rows.all()}
    top_by_referrals = [
        RatingEntry(
            patient_id=r.patient_id,
            name=ref_names.get(r.patient_id, "—"),
            value=int(r.cnt or 0),
            rank=i + 1,
        )
        for i, r in enumerate(ref_rows)
    ]

    return LoyaltyStats(
        total_points_awarded=total_points,
        points_by_action=points_by_action,
        pending_reviews=int(pending_reviews),
        approved_reviews=int(approved_reviews),
        total_referrals=int(total_referrals),
        active_patients=int(active_patients),
        top_by_balance=top_by_balance,
        top_by_referrals=top_by_referrals,
    )
