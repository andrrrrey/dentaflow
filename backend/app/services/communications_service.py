import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas.communication import (
    CommunicationListResponse,
    CommunicationResponse,
    CommunicationUpdate,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _mock_communications() -> list[CommunicationResponse]:
    """Generate 18 realistic mock communications for a dental clinic."""
    now = _utcnow()

    items: list[CommunicationResponse] = [
        # --- Telegram messages (5) ---
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000001"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000001"),
            patient_name="Мария Соколова",
            channel="telegram",
            direction="inbound",
            type="message",
            content="Здравствуйте! Хочу записаться на отбеливание. Какая стоимость и есть ли свободные даты на следующей неделе?",
            media_url=None,
            duration_sec=None,
            status="new",
            priority="high",
            ai_tags=["горячий_лид", "отбеливание"],
            ai_summary="Пациентка интересуется отбеливанием. Готова записаться на следующую неделю. Высокая вероятность конверсии.",
            ai_next_action="Ответить с ценами на отбеливание и предложить свободные слоты",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=12),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000002"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000002"),
            patient_name="Дмитрий Козлов",
            channel="telegram",
            direction="inbound",
            type="message",
            content="Добрый день. Мне нужна консультация ортодонта. У ребёнка неправильный прикус, ему 12 лет. Сколько стоит первичный приём?",
            media_url=None,
            duration_sec=None,
            status="new",
            priority="normal",
            ai_tags=["ортодонтия", "детский", "первичный"],
            ai_summary="Отец интересуется ортодонтией для ребёнка 12 лет. Нужна консультация по прикусу.",
            ai_next_action="Предложить запись на консультацию к ортодонту Козлову Д.И.",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=34),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000003"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000003"),
            patient_name="Елена Васильева",
            channel="telegram",
            direction="inbound",
            type="message",
            content="Спасибо, подтверждаю запись на четверг в 15:00. Нужно ли что-то подготовить перед приёмом?",
            media_url=None,
            duration_sec=None,
            status="in_progress",
            priority="normal",
            ai_tags=["подтверждение", "повторный"],
            ai_summary="Пациентка подтвердила запись на четверг 15:00. Спрашивает о подготовке.",
            ai_next_action="Отправить инструкцию по подготовке к приёму",
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(minutes=15),
            created_at=now - timedelta(hours=2),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000004"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000004"),
            patient_name="Андрей Новиков",
            channel="telegram",
            direction="inbound",
            type="message",
            content="Это слишком дорого. В другой клинике мне предложили имплант за 35 тысяч. Почему у вас 55?",
            media_url=None,
            duration_sec=None,
            status="in_progress",
            priority="high",
            ai_tags=["возражение_цена", "имплантация"],
            ai_summary="Пациент возражает по цене на имплантацию. Сравнивает с конкурентом (35 vs 55 тыс.).",
            ai_next_action="Объяснить разницу в качестве материалов и гарантии. Предложить рассрочку.",
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(minutes=5),
            created_at=now - timedelta(hours=1, minutes=20),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000005"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000005"),
            patient_name="Ирина Петрова",
            channel="telegram",
            direction="outbound",
            type="message",
            content="Ирина, напоминаем о вашем визите завтра в 10:00 к доктору Ивановой. Ждём вас!",
            media_url=None,
            duration_sec=None,
            status="done",
            priority="normal",
            ai_tags=["напоминание"],
            ai_summary="Автоматическое напоминание о визите отправлено.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(hours=3),
            created_at=now - timedelta(hours=3),
        ),
        # --- Novofon / Calls (5) ---
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000006"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000006"),
            patient_name="Сергей Морозов",
            channel="novofon",
            direction="inbound",
            type="call",
            content="Пациент звонил для записи на удаление зуба мудрости. Беспокоит боль справа внизу.",
            media_url=None,
            duration_sec=187,
            status="new",
            priority="urgent",
            ai_tags=["горячий_лид", "хирургия", "боль"],
            ai_summary="Пациент с острой болью. Нужно удаление зуба мудрости. Срочная запись.",
            ai_next_action="Записать на ближайший свободный слот к хирургу Сидоровой",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=8),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000007"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000007"),
            patient_name="Алексей Белов",
            channel="novofon",
            direction="inbound",
            type="missed_call",
            content=None,
            media_url=None,
            duration_sec=0,
            status="new",
            priority="high",
            ai_tags=["пропущенный"],
            ai_summary="Пропущенный звонок. Номер есть в базе - постоянный пациент.",
            ai_next_action="Перезвонить в течение 15 минут",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=22),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000008"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000008"),
            patient_name="Ольга Кузнецова",
            channel="novofon",
            direction="inbound",
            type="call",
            content="Пациентка перенесла запись с пятницы на понедельник. Просит утреннее время.",
            media_url=None,
            duration_sec=94,
            status="in_progress",
            priority="normal",
            ai_tags=["перенос", "повторный"],
            ai_summary="Перенос записи на понедельник утро. Постоянная пациентка.",
            ai_next_action="Подтвердить перенос записи и отправить SMS-напоминание",
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000002"),
            assigned_to_name="Мария Волкова",
            responded_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1, minutes=30),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000009"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000009"),
            patient_name="Наталья Лебедева",
            channel="novofon",
            direction="outbound",
            type="call",
            content="Звонок-напоминание о приёме. Пациентка подтвердила визит.",
            media_url=None,
            duration_sec=45,
            status="done",
            priority="normal",
            ai_tags=["напоминание", "подтверждение"],
            ai_summary="Пациентка подтвердила визит по телефону.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000002"),
            assigned_to_name="Мария Волкова",
            responded_at=now - timedelta(hours=4),
            created_at=now - timedelta(hours=4),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000010"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000010"),
            patient_name="Виктор Семёнов",
            channel="novofon",
            direction="outbound",
            type="call",
            content="Обзвон пациентов на проф. осмотр. Записан на следующую среду.",
            media_url=None,
            duration_sec=120,
            status="done",
            priority="normal",
            ai_tags=["профосмотр", "повторный"],
            ai_summary="Пациент записан на профосмотр. Последний визит 8 месяцев назад.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(hours=5),
            created_at=now - timedelta(hours=5),
        ),
        # --- Max/VK (3) ---
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000011"),
            patient_id=None,
            patient_name=None,
            channel="max",
            direction="inbound",
            type="message",
            content="Здравствуйте, увидела вашу рекламу ВКонтакте. Делаете ли вы виниры? И примерная цена?",
            media_url=None,
            duration_sec=None,
            status="new",
            priority="normal",
            ai_tags=["горячий_лид", "виниры", "реклама"],
            ai_summary="Новый лид из рекламы VK. Интерес к винирам. Пациентка не в базе.",
            ai_next_action="Запросить контактные данные, рассказать о винирах и пригласить на консультацию",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=45),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000012"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000012"),
            patient_name="Анна Федорова",
            channel="max",
            direction="inbound",
            type="message",
            content="Можно ли оплатить лечение в рассрочку? У меня большой план лечения.",
            media_url=None,
            duration_sec=None,
            status="in_progress",
            priority="normal",
            ai_tags=["возражение_цена", "рассрочка"],
            ai_summary="Пациентка интересуется рассрочкой на план лечения.",
            ai_next_action="Отправить условия рассрочки и варианты оплаты",
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(hours=2),
            created_at=now - timedelta(hours=3),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000013"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000013"),
            patient_name="Павел Тихонов",
            channel="max",
            direction="outbound",
            type="message",
            content="Павел, ваш план лечения готов. Отправляю его вам в PDF. Жду обратной связи!",
            media_url="https://example.com/treatment-plan-123.pdf",
            duration_sec=None,
            status="done",
            priority="normal",
            ai_tags=["план_лечения"],
            ai_summary="План лечения отправлен пациенту через VK.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000002"),
            assigned_to_name="Мария Волкова",
            responded_at=now - timedelta(hours=6),
            created_at=now - timedelta(hours=7),
        ),
        # --- Site forms (2) ---
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000014"),
            patient_id=None,
            patient_name=None,
            channel="site",
            direction="inbound",
            type="form",
            content="Имя: Татьяна. Телефон: +7 (999) 123-45-67. Комментарий: Хочу поставить брекеты, мне 28 лет. Есть ли скидки?",
            media_url=None,
            duration_sec=None,
            status="new",
            priority="urgent",
            ai_tags=["горячий_лид", "ортодонтия", "брекеты"],
            ai_summary="Заявка с сайта. Взрослая ортодонтия (брекеты). Спрашивает о скидках.",
            ai_next_action="Позвонить в течение 5 минут. Предложить бесплатную консультацию ортодонта.",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=3),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000015"),
            patient_id=None,
            patient_name=None,
            channel="site",
            direction="inbound",
            type="form",
            content="Имя: Роман. Телефон: +7 (926) 987-65-43. Комментарий: Нужна имплантация верхней челюсти. Какие варианты?",
            media_url=None,
            duration_sec=None,
            status="done",
            priority="normal",
            ai_tags=["имплантация", "повторный"],
            ai_summary="Заявка с сайта. Имплантация верхней челюсти. Перезвонили, записан.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(hours=8),
            created_at=now - timedelta(hours=9),
        ),
        # --- Extra items for variety ---
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000016"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000016"),
            patient_name="Людмила Орлова",
            channel="telegram",
            direction="inbound",
            type="message",
            content="После лечения каналов зуб стал реагировать на холодное. Это нормально? Прошло 3 дня.",
            media_url=None,
            duration_sec=None,
            status="new",
            priority="high",
            ai_tags=["жалоба", "после_лечения", "эндодонтия"],
            ai_summary="Жалоба после лечения каналов. Чувствительность к холодному, 3 дня.",
            ai_next_action="Срочно проконсультировать. Возможно потребуется повторный визит.",
            assigned_to=None,
            assigned_to_name=None,
            responded_at=None,
            created_at=now - timedelta(minutes=55),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000017"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000017"),
            patient_name="Григорий Волков",
            channel="novofon",
            direction="inbound",
            type="call",
            content="Хочет узнать результаты рентгена. Просит перезвонить после 17:00.",
            media_url=None,
            duration_sec=63,
            status="done",
            priority="normal",
            ai_tags=["рентген", "повторный"],
            ai_summary="Запрос результатов рентгена. Перезвонить после 17:00.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000002"),
            assigned_to_name="Мария Волкова",
            responded_at=now - timedelta(hours=2),
            created_at=now - timedelta(hours=6),
        ),
        CommunicationResponse(
            id=uuid.UUID("a0000000-0000-0000-0000-000000000018"),
            patient_id=uuid.UUID("b0000000-0000-0000-0000-000000000018"),
            patient_name="Екатерина Зайцева",
            channel="telegram",
            direction="inbound",
            type="message",
            content="Отлично! Спасибо за консультацию. Буду думать и вернусь к вам на следующей неделе.",
            media_url=None,
            duration_sec=None,
            status="done",
            priority="normal",
            ai_tags=["думает", "повторный"],
            ai_summary="Пациентка после консультации берёт паузу. Вернётся на следующей неделе.",
            ai_next_action=None,
            assigned_to=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
            assigned_to_name="Ольга Смирнова",
            responded_at=now - timedelta(hours=10),
            created_at=now - timedelta(hours=12),
        ),
    ]

    return items


async def get_communications(
    *,
    status: str | None = None,
    channel: str | None = None,
    priority: str | None = None,
    page: int = 1,
    limit: int = 50,
    db: AsyncSession,
) -> CommunicationListResponse:
    """Return communications list.

    In development mode, returns realistic mock data.
    In production, will query the database.
    """
    all_items = _mock_communications()

    # Filter
    filtered = all_items
    if status:
        filtered = [i for i in filtered if i.status == status]
    if channel:
        filtered = [i for i in filtered if i.channel == channel]
    if priority:
        filtered = [i for i in filtered if i.priority == priority]

    # Sort by created_at desc
    filtered.sort(key=lambda x: x.created_at, reverse=True)

    total = len(filtered)
    unread_count = sum(1 for i in all_items if i.status == "new")

    # Paginate
    start = (page - 1) * limit
    end = start + limit
    page_items = filtered[start:end]

    return CommunicationListResponse(
        items=page_items,
        total=total,
        unread_count=unread_count,
    )


async def get_communication_by_id(
    communication_id: uuid.UUID,
    db: AsyncSession,
) -> CommunicationResponse | None:
    """Return a single communication by ID."""
    all_items = _mock_communications()
    for item in all_items:
        if item.id == communication_id:
            return item
    return None


async def update_communication(
    communication_id: uuid.UUID,
    update: CommunicationUpdate,
    db: AsyncSession,
) -> CommunicationResponse | None:
    """Update a communication (mock — returns item with patched fields)."""
    item = await get_communication_by_id(communication_id, db)
    if item is None:
        return None

    data = item.model_dump()
    if update.status is not None:
        data["status"] = update.status
    if update.assigned_to is not None:
        data["assigned_to"] = update.assigned_to
    if update.priority is not None:
        data["priority"] = update.priority

    return CommunicationResponse(**data)


async def get_communication_stats(
    db: AsyncSession,
) -> dict[str, int]:
    """Return counts by status."""
    all_items = _mock_communications()
    stats: dict[str, int] = {"new": 0, "in_progress": 0, "done": 0, "ignored": 0}
    for item in all_items:
        stats[item.status] = stats.get(item.status, 0) + 1
    stats["total"] = len(all_items)
    return stats
