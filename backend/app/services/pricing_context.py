"""Прайс услуг из справочников 1Denta для контекста ботов.

Боты (Telegram/Max) должны «знать» цены услуг, но при этом называть пациенту
только вилку/примеры и всегда подчёркивать, что точная стоимость определяется
на приёме. Здесь собирается компактный прайс из локального кэша справочников
(`directory_cache`, категория `service`) для подмешивания в контекст ассистента.
"""

from __future__ import annotations

import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.directory_cache import DirectoryCache

logger = logging.getLogger(__name__)

# Ограничение на длину блока: контекст ассистента режется по 8000 символов
# (ai_service), прайс идёт лишь одной из частей, поэтому держим его компактным.
_MAX_CHARS = 4500


def _parse_price(raw) -> float | None:
    """Достаёт число из строки/числа цены ('1500', '1 500 ₽', 1500.0)."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if raw > 0 else None
    digits = re.sub(r"[^\d.]", "", str(raw).replace(",", "."))
    if not digits:
        return None
    try:
        val = float(digits)
    except ValueError:
        return None
    return val if val > 0 else None


def _fmt(n: float) -> str:
    """Форматирует цену: 1500 -> '1 500' (пробел-разделитель тысяч)."""
    return f"{int(round(n)):,}".replace(",", " ")


async def build_price_context(db: AsyncSession) -> str:
    """Компактный прайс услуг для контекста ассистента.

    Возвращает пустую строку, если справочник услуг пуст. Услуги группируются
    по категориям; по каждой категории показывается диапазон цен, затем список
    услуг с ценами (усечённый по длине). Явно помечает, что это внутренние
    ориентиры — пациенту точную цену называть нельзя, только вилку/примеры.
    """
    try:
        rows = (await db.execute(
            select(DirectoryCache)
            .where(DirectoryCache.category == "service")
            .order_by(DirectoryCache.name)
        )).scalars().all()
    except Exception:
        logger.warning("pricing_context: не удалось прочитать справочник услуг")
        return ""

    # Группировка по категории с ценами
    by_cat: dict[str, list[tuple[str, float]]] = {}
    for r in rows:
        data = r.data or {}
        price = _parse_price(data.get("price"))
        if price is None:
            continue
        name = (data.get("name") or r.name or "").strip()
        if not name:
            continue
        cat = (data.get("categoryName") or "Прочие услуги").strip() or "Прочие услуги"
        by_cat.setdefault(cat, []).append((name, price))

    if not by_cat:
        return ""

    lines: list[str] = [
        "Прайс услуг клиники (ВНУТРЕННИЙ ОРИЕНТИР — цены брать отсюда, но "
        "пациенту НЕЛЬЗЯ называть точную цену за услугу; можно назвать только "
        "диапазон «от X до Y» или примеры, и всегда добавлять, что точная "
        "стоимость определяется на приёме):",
    ]
    for cat in sorted(by_cat):
        items = by_cat[cat]
        prices = [p for _, p in items]
        lo, hi = min(prices), max(prices)
        rng = _fmt(lo) if lo == hi else f"{_fmt(lo)}–{_fmt(hi)}"
        lines.append(f"\n• {cat} (диапазон {rng} ₽):")
        for name, price in items:
            lines.append(f"  – {name}: {_fmt(price)} ₽")

    text = "\n".join(lines)
    if len(text) > _MAX_CHARS:
        text = text[:_MAX_CHARS].rstrip() + "\n… (список сокращён)"
    return text
