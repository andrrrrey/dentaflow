"""Проверка попадания записи в график работы врача.

График хранится в ``DoctorProfile`` (недельные часы + исключения по датам) в
локальном времени клиники. Время записи (``scheduled_at``) в системе тоже
хранится как «настенное» локальное время клиники (input ``datetime-local`` без
смещения, а отображение использует ``getHours()`` напрямую), поэтому сравнение
идёт по компонентам даты/времени без перевода часовых поясов.
"""

from __future__ import annotations

from datetime import datetime

from app.models.doctor_profile import DoctorProfile


def _to_min(value: str | None) -> int | None:
    """'09:00' -> 540. None/пусто -> None."""
    if not value:
        return None
    try:
        hh, mm = str(value).split(":")[:2]
        return int(hh) * 60 + int(mm)
    except (ValueError, TypeError):
        return None


def _interval_covers(day_cfg: dict, start_min: int, end_min: int) -> bool:
    """True, если [start_min, end_min) укладывается в рабочий интервал дня и
    не пересекается с перерывом."""
    work_start = _to_min(day_cfg.get("start"))
    work_end = _to_min(day_cfg.get("end"))
    if work_start is None or work_end is None:
        # Интервал не задан для рабочего дня — считаем ограничение неактивным.
        return True
    if start_min < work_start or end_min > work_end:
        return False
    # Перерыв: запись не должна пересекаться с ним.
    br_start = _to_min(day_cfg.get("break_start"))
    br_end = _to_min(day_cfg.get("break_end"))
    if br_start is not None and br_end is not None and br_end > br_start:
        if start_min < br_end and end_min > br_start:
            return False
    return True


def has_active_schedule(profile: DoctorProfile | None) -> bool:
    """Есть ли у врача заданный график (иначе ограничений нет)."""
    if profile is None:
        return False
    if profile.weekly_hours:
        # Хотя бы один день с интервалом.
        for cfg in profile.weekly_hours.values():
            if isinstance(cfg, dict) and cfg.get("start") and cfg.get("end"):
                return True
    if profile.schedule_exceptions:
        return True
    return False


def is_within_schedule(profile: DoctorProfile | None, start: datetime, end: datetime) -> bool:
    """True, если интервал [start, end) попадает в график врача.

    ``start``/``end`` — «настенное» локальное время (используются компоненты
    date/weekday/hour/minute). Врач без графика → всегда True.
    """
    if not has_active_schedule(profile):
        return True

    start_min = start.hour * 60 + start.minute
    end_min = end.hour * 60 + end.minute
    # Запись, переходящая через полночь, считаем вне графика.
    if end.date() != start.date():
        return False

    # 1) Исключения на конкретную дату имеют приоритет.
    iso_date = start.date().isoformat()
    for exc in (profile.schedule_exceptions or []):
        if not isinstance(exc, dict) or exc.get("date") != iso_date:
            continue
        if exc.get("off"):
            return False
        return _interval_covers(exc, start_min, end_min)

    # 2) Недельный график. weekday(): Пн=0 .. Вс=6 — совпадает с ключами.
    weekly = profile.weekly_hours or {}
    day_cfg = weekly.get(str(start.weekday()))
    if not isinstance(day_cfg, dict) or not day_cfg.get("start"):
        # День не задан = выходной.
        return False
    return _interval_covers(day_cfg, start_min, end_min)
