"""Mock data service for CRM pipeline deals."""

import uuid
from datetime import datetime, timedelta, timezone

from app.schemas.deal import (
    DealResponse,
    PipelineResponse,
    StageColumn,
    StageHistoryEntry,
)

STAGES = [
    ("new", "Новые"),
    ("contact", "Контакт"),
    ("negotiation", "Переговоры"),
    ("scheduled", "Записан"),
    ("treatment", "Лечение"),
    ("closed_won", "Закрыто \u2713"),
    ("closed_lost", "Закрыто \u2717"),
]

_now = datetime.now(timezone.utc)


def _dt(days_ago: int) -> datetime:
    return _now - timedelta(days=days_ago)


# Pre-generated UUIDs for stable mock data
_uuids = [uuid.UUID(f"00000000-0000-4000-a000-{i:012d}") for i in range(30)]
_assigned_uuids = [
    uuid.UUID("a0000000-0000-4000-a000-000000000001"),
    uuid.UUID("a0000000-0000-4000-a000-000000000002"),
    uuid.UUID("a0000000-0000-4000-a000-000000000003"),
]

MOCK_DEALS: list[DealResponse] = [
    # --- new ---
    DealResponse(
        id=_uuids[0],
        patient_id=_uuids[20],
        patient_name="Иванов Сергей",
        title="Имплантация зубов",
        stage="new",
        amount=180000,
        service="Имплантация",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="website",
        notes="Обратился через сайт",
        lost_reason=None,
        stage_changed_at=_dt(1),
        created_at=_dt(1),
    ),
    DealResponse(
        id=_uuids[1],
        patient_id=_uuids[21],
        patient_name="Петрова Мария",
        title="Установка виниров",
        stage="new",
        amount=120000,
        service="Виниры",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        source_channel="instagram",
        notes=None,
        lost_reason=None,
        stage_changed_at=_dt(0),
        created_at=_dt(0),
    ),
    DealResponse(
        id=_uuids[2],
        patient_id=_uuids[22],
        patient_name="Кузнецов Алексей",
        title="Лечение кариеса",
        stage="new",
        amount=15000,
        service="Лечение кариеса",
        doctor_name="Морозов И.П.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="phone",
        notes="Звонок на рецепцию",
        lost_reason=None,
        stage_changed_at=_dt(0),
        created_at=_dt(0),
    ),
    # --- contact ---
    DealResponse(
        id=_uuids[3],
        patient_id=_uuids[23],
        patient_name="Сидорова Елена",
        title="Ортодонтия — брекеты",
        stage="contact",
        amount=250000,
        service="Ортодонтия",
        doctor_name="Белова Т.С.",
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        source_channel="telegram",
        notes="Хочет консультацию по брекетам",
        lost_reason=None,
        stage_changed_at=_dt(3),
        created_at=_dt(5),
    ),
    DealResponse(
        id=_uuids[4],
        patient_id=_uuids[24],
        patient_name="Морозов Дмитрий",
        title="Отбеливание зубов",
        stage="contact",
        amount=25000,
        service="Отбеливание",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        source_channel="whatsapp",
        notes=None,
        lost_reason=None,
        stage_changed_at=_dt(2),
        created_at=_dt(4),
    ),
    # --- negotiation ---
    DealResponse(
        id=_uuids[5],
        patient_id=None,
        patient_name="Васильева Ольга",
        title="Протезирование",
        stage="negotiation",
        amount=350000,
        service="Протезирование",
        doctor_name="Морозов И.П.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="website",
        notes="Требуется полное протезирование верхней челюсти",
        lost_reason=None,
        stage_changed_at=_dt(4),
        created_at=_dt(10),
    ),
    DealResponse(
        id=_uuids[6],
        patient_id=_uuids[25],
        patient_name="Новиков Артём",
        title="Имплантация + виниры",
        stage="negotiation",
        amount=280000,
        service="Имплантация",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        source_channel="instagram",
        notes="Комплексный план лечения",
        lost_reason=None,
        stage_changed_at=_dt(2),
        created_at=_dt(7),
    ),
    DealResponse(
        id=_uuids[7],
        patient_id=_uuids[26],
        patient_name="Федорова Наталья",
        title="Лечение кариеса (3 зуба)",
        stage="negotiation",
        amount=42000,
        service="Лечение кариеса",
        doctor_name="Белова Т.С.",
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        source_channel="phone",
        notes=None,
        lost_reason=None,
        stage_changed_at=_dt(1),
        created_at=_dt(6),
    ),
    # --- scheduled ---
    DealResponse(
        id=_uuids[8],
        patient_id=_uuids[27],
        patient_name="Козлов Андрей",
        title="Виниры на 6 зубов",
        stage="scheduled",
        amount=210000,
        service="Виниры",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="telegram",
        notes="Записан на 15 апреля",
        lost_reason=None,
        stage_changed_at=_dt(1),
        created_at=_dt(12),
    ),
    DealResponse(
        id=_uuids[9],
        patient_id=_uuids[28],
        patient_name="Белова Ирина",
        title="Ортодонтия — элайнеры",
        stage="scheduled",
        amount=190000,
        service="Ортодонтия",
        doctor_name="Белова Т.С.",
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        source_channel="website",
        notes="Записана на консультацию",
        lost_reason=None,
        stage_changed_at=_dt(0),
        created_at=_dt(8),
    ),
    DealResponse(
        id=_uuids[10],
        patient_id=_uuids[29],
        patient_name="Егоров Максим",
        title="Отбеливание + гигиена",
        stage="scheduled",
        amount=32000,
        service="Отбеливание",
        doctor_name="Морозов И.П.",
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        source_channel="phone",
        notes=None,
        lost_reason=None,
        stage_changed_at=_dt(0),
        created_at=_dt(3),
    ),
    # --- treatment ---
    DealResponse(
        id=_uuids[11],
        patient_id=_uuids[20],
        patient_name="Романова Светлана",
        title="Имплантация (2 импланта)",
        stage="treatment",
        amount=240000,
        service="Имплантация",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="website",
        notes="Установлены импланты, ожидание приживления",
        lost_reason=None,
        stage_changed_at=_dt(5),
        created_at=_dt(30),
    ),
    DealResponse(
        id=_uuids[12],
        patient_id=_uuids[21],
        patient_name="Тихонов Павел",
        title="Протезирование на имплантах",
        stage="treatment",
        amount=320000,
        service="Протезирование",
        doctor_name="Морозов И.П.",
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        source_channel="telegram",
        notes="Второй этап лечения",
        lost_reason=None,
        stage_changed_at=_dt(3),
        created_at=_dt(25),
    ),
    # --- closed_won ---
    DealResponse(
        id=_uuids[13],
        patient_id=_uuids[22],
        patient_name="Алексеева Дарья",
        title="Виниры E-max",
        stage="closed_won",
        amount=180000,
        service="Виниры",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        source_channel="instagram",
        notes="Лечение завершено успешно",
        lost_reason=None,
        stage_changed_at=_dt(1),
        created_at=_dt(20),
    ),
    DealResponse(
        id=_uuids[14],
        patient_id=_uuids[23],
        patient_name="Григорьев Илья",
        title="Лечение кариеса + пломбы",
        stage="closed_won",
        amount=28000,
        service="Лечение кариеса",
        doctor_name="Белова Т.С.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="phone",
        notes="Завершено",
        lost_reason=None,
        stage_changed_at=_dt(0),
        created_at=_dt(14),
    ),
    DealResponse(
        id=_uuids[15],
        patient_id=_uuids[24],
        patient_name="Лебедева Анна",
        title="Отбеливание ZOOM",
        stage="closed_won",
        amount=22000,
        service="Отбеливание",
        doctor_name="Морозов И.П.",
        assigned_to=_assigned_uuids[2],
        assigned_to_name="Ольга Козлова",
        source_channel="whatsapp",
        notes=None,
        lost_reason=None,
        stage_changed_at=_dt(2),
        created_at=_dt(10),
    ),
    # --- closed_lost ---
    DealResponse(
        id=_uuids[16],
        patient_id=_uuids[25],
        patient_name="Орлов Владимир",
        title="Ортодонтия — брекеты",
        stage="closed_lost",
        amount=230000,
        service="Ортодонтия",
        doctor_name="Белова Т.С.",
        assigned_to=_assigned_uuids[1],
        assigned_to_name="Дмитрий Волков",
        source_channel="website",
        notes=None,
        lost_reason="Слишком дорого",
        stage_changed_at=_dt(3),
        created_at=_dt(15),
    ),
    DealResponse(
        id=_uuids[17],
        patient_id=_uuids[26],
        patient_name="Михайлова Екатерина",
        title="Имплантация зубов",
        stage="closed_lost",
        amount=200000,
        service="Имплантация",
        doctor_name="Козлова Е.А.",
        assigned_to=_assigned_uuids[0],
        assigned_to_name="Анна Смирнова",
        source_channel="telegram",
        notes=None,
        lost_reason="Выбрала другую клинику",
        stage_changed_at=_dt(5),
        created_at=_dt(18),
    ),
]

MOCK_HISTORY: list[StageHistoryEntry] = [
    StageHistoryEntry(
        id=uuid.uuid4(),
        deal_id=_uuids[8],
        from_stage="new",
        to_stage="contact",
        changed_by=_assigned_uuids[0],
        comment=None,
        created_at=_dt(10),
    ),
    StageHistoryEntry(
        id=uuid.uuid4(),
        deal_id=_uuids[8],
        from_stage="contact",
        to_stage="negotiation",
        changed_by=_assigned_uuids[0],
        comment="Обсудили план лечения",
        created_at=_dt(5),
    ),
    StageHistoryEntry(
        id=uuid.uuid4(),
        deal_id=_uuids[8],
        from_stage="negotiation",
        to_stage="scheduled",
        changed_by=_assigned_uuids[0],
        comment="Записан на приём",
        created_at=_dt(1),
    ),
]


async def get_pipeline(
    stage: str | None = None,
    assigned_to: str | None = None,
) -> PipelineResponse:
    """Build pipeline response from mock data."""
    deals = list(MOCK_DEALS)

    if assigned_to:
        deals = [d for d in deals if str(d.assigned_to) == assigned_to]

    if stage:
        deals = [d for d in deals if d.stage == stage]

    columns: list[StageColumn] = []
    total_value = 0.0

    for stage_key, label in STAGES:
        stage_deals = [d for d in deals if d.stage == stage_key]
        stage_total = sum(d.amount or 0 for d in stage_deals)
        total_value += stage_total
        columns.append(
            StageColumn(
                stage=stage_key,
                label=label,
                deals=stage_deals,
                count=len(stage_deals),
                total_amount=stage_total,
            )
        )

    return PipelineResponse(stages=columns, total_pipeline_value=total_value)


async def get_deal(deal_id: uuid.UUID) -> DealResponse | None:
    for deal in MOCK_DEALS:
        if deal.id == deal_id:
            return deal
    return None


async def create_deal(
    title: str,
    stage: str = "new",
    patient_id: uuid.UUID | None = None,
    amount: float | None = None,
    service: str | None = None,
    assigned_to: uuid.UUID | None = None,
) -> DealResponse:
    new_deal = DealResponse(
        id=uuid.uuid4(),
        patient_id=patient_id,
        patient_name=None,
        title=title,
        stage=stage,
        amount=amount,
        service=service,
        doctor_name=None,
        assigned_to=assigned_to,
        assigned_to_name=None,
        source_channel=None,
        notes=None,
        lost_reason=None,
        stage_changed_at=_now,
        created_at=_now,
    )
    MOCK_DEALS.append(new_deal)
    return new_deal


async def update_deal(
    deal_id: uuid.UUID,
    stage: str | None = None,
    amount: float | None = None,
    notes: str | None = None,
    lost_reason: str | None = None,
    title: str | None = None,
) -> DealResponse | None:
    for i, deal in enumerate(MOCK_DEALS):
        if deal.id == deal_id:
            data = deal.model_dump()
            if stage is not None:
                old_stage = data["stage"]
                data["stage"] = stage
                data["stage_changed_at"] = _now
                MOCK_HISTORY.append(
                    StageHistoryEntry(
                        id=uuid.uuid4(),
                        deal_id=deal_id,
                        from_stage=old_stage,
                        to_stage=stage,
                        changed_by=None,
                        comment=None,
                        created_at=_now,
                    )
                )
            if amount is not None:
                data["amount"] = amount
            if notes is not None:
                data["notes"] = notes
            if lost_reason is not None:
                data["lost_reason"] = lost_reason
            if title is not None:
                data["title"] = title
            updated = DealResponse(**data)
            MOCK_DEALS[i] = updated
            return updated
    return None


async def delete_deal(deal_id: uuid.UUID) -> bool:
    for i, deal in enumerate(MOCK_DEALS):
        if deal.id == deal_id:
            MOCK_DEALS.pop(i)
            return True
    return False


async def get_deal_history(deal_id: uuid.UUID) -> list[StageHistoryEntry]:
    return [h for h in MOCK_HISTORY if h.deal_id == deal_id]
