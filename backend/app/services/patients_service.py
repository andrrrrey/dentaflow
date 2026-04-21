"""Mock data service for Patient 360 card."""

import uuid
from datetime import datetime, timedelta, timezone

from app.schemas.patient import (
    AIAnalysis,
    AppointmentResponse,
    CommunicationBrief,
    DealBrief,
    PatientDetailResponse,
    PatientListResponse,
    PatientResponse,
    TaskBrief,
)

_now = datetime.now(timezone.utc)


def _dt(days_ago: int, hour: int = 10) -> datetime:
    return (_now - timedelta(days=days_ago)).replace(
        hour=hour, minute=0, second=0, microsecond=0
    )


# Stable UUIDs
def _pid(n: int) -> uuid.UUID:
    return uuid.UUID(f"a0000000-0000-4000-a000-{n:012d}")


MOCK_PATIENTS: list[PatientResponse] = [
    PatientResponse(
        id=_pid(1),
        external_id="1D-10234",
        name="Иванова Анна Сергеевна",
        phone="+7 (926) 123-45-67",
        email="ivanova.anna@mail.ru",
        birth_date="1990-03-15",
        source_channel="telegram",
        is_new_patient=False,
        last_visit_at=_dt(5),
        total_revenue=185000,
        ltv_score=82,
        tags=["VIP", "ортодонтия", "рассрочка"],
        created_at=_dt(180),
    ),
    PatientResponse(
        id=_pid(2),
        external_id="1D-10235",
        name="Петров Дмитрий Владимирович",
        phone="+7 (903) 987-65-43",
        email="petrov.dv@gmail.com",
        birth_date="1985-07-22",
        source_channel="site",
        is_new_patient=False,
        last_visit_at=_dt(12),
        total_revenue=320000,
        ltv_score=91,
        tags=["VIP", "имплантация"],
        created_at=_dt(365),
    ),
    PatientResponse(
        id=_pid(3),
        external_id="1D-10236",
        name="Козлова Елена Александровна",
        phone="+7 (915) 555-12-34",
        email="kozlova.ea@yandex.ru",
        birth_date="1995-11-08",
        source_channel="telegram",
        is_new_patient=True,
        last_visit_at=_dt(2),
        total_revenue=15000,
        ltv_score=45,
        tags=["новый", "отбеливание"],
        created_at=_dt(10),
    ),
    PatientResponse(
        id=_pid(4),
        external_id="1D-10237",
        name="Сидоров Алексей Михайлович",
        phone="+7 (916) 777-88-99",
        email=None,
        birth_date="1978-01-30",
        source_channel="call",
        is_new_patient=False,
        last_visit_at=_dt(45),
        total_revenue=95000,
        ltv_score=38,
        tags=["протезирование", "риск_оттока"],
        created_at=_dt(400),
    ),
    PatientResponse(
        id=_pid(5),
        external_id="1D-10238",
        name="Морозова Ольга Петровна",
        phone="+7 (925) 333-22-11",
        email="morozova.op@mail.ru",
        birth_date="1992-06-17",
        source_channel="max",
        is_new_patient=False,
        last_visit_at=_dt(8),
        total_revenue=210000,
        ltv_score=75,
        tags=["виниры", "повторный"],
        created_at=_dt(200),
    ),
    PatientResponse(
        id=_pid(6),
        external_id="1D-10239",
        name="Васильев Николай Игоревич",
        phone="+7 (909) 444-55-66",
        email="vasiliev.ni@gmail.com",
        birth_date="1982-12-03",
        source_channel="referral",
        is_new_patient=False,
        last_visit_at=_dt(20),
        total_revenue=540000,
        ltv_score=95,
        tags=["VIP", "имплантация", "протезирование"],
        created_at=_dt(500),
    ),
    PatientResponse(
        id=_pid(7),
        external_id="1D-10240",
        name="Новикова Мария Андреевна",
        phone="+7 (917) 111-22-33",
        email="novikova.ma@yandex.ru",
        birth_date="2000-09-25",
        source_channel="telegram",
        is_new_patient=True,
        last_visit_at=None,
        total_revenue=0,
        ltv_score=20,
        tags=["новый", "консультация"],
        created_at=_dt(1),
    ),
    PatientResponse(
        id=_pid(8),
        external_id="1D-10241",
        name="Фёдоров Артём Викторович",
        phone="+7 (926) 888-99-00",
        email="fedorov.av@mail.ru",
        birth_date="1988-04-11",
        source_channel="site",
        is_new_patient=False,
        last_visit_at=_dt(3),
        total_revenue=78000,
        ltv_score=60,
        tags=["лечение", "гигиена"],
        created_at=_dt(90),
    ),
    PatientResponse(
        id=_pid(9),
        external_id="1D-10242",
        name="Белова Татьяна Сергеевна",
        phone="+7 (903) 222-33-44",
        email="belova.ts@gmail.com",
        birth_date="1975-08-19",
        source_channel="call",
        is_new_patient=False,
        last_visit_at=_dt(60),
        total_revenue=150000,
        ltv_score=42,
        tags=["риск_оттока", "протезирование"],
        created_at=_dt(600),
    ),
    PatientResponse(
        id=_pid(10),
        external_id="1D-10243",
        name="Егоров Максим Дмитриевич",
        phone="+7 (915) 666-77-88",
        email="egorov.md@yandex.ru",
        birth_date="1998-02-14",
        source_channel="telegram",
        is_new_patient=False,
        last_visit_at=_dt(1),
        total_revenue=42000,
        ltv_score=55,
        tags=["гигиена", "отбеливание"],
        created_at=_dt(30),
    ),
]

# --- Detail data for patient 1 (Ivanova) ---

_MOCK_APPOINTMENTS: list[AppointmentResponse] = [
    AppointmentResponse(
        id=uuid.UUID("a1000000-0000-4000-a000-000000000001"),
        external_id="APT-5001",
        patient_id=_pid(1),
        doctor_name="Козлова Е.А.",
        service="Консультация ортодонта",
        branch="Клиника на Тверской",
        scheduled_at=_dt(5, 10),
        duration_min=60,
        status="completed",
        no_show_risk=5,
        revenue=3000,
        created_at=_dt(7),
    ),
    AppointmentResponse(
        id=uuid.UUID("a1000000-0000-4000-a000-000000000002"),
        external_id="APT-4892",
        patient_id=_pid(1),
        doctor_name="Козлова Е.А.",
        service="Установка брекетов (верхняя челюсть)",
        branch="Клиника на Тверской",
        scheduled_at=_dt(30, 14),
        duration_min=90,
        status="completed",
        no_show_risk=8,
        revenue=85000,
        created_at=_dt(32),
    ),
    AppointmentResponse(
        id=uuid.UUID("a1000000-0000-4000-a000-000000000003"),
        external_id="APT-4650",
        patient_id=_pid(1),
        doctor_name="Морозов И.П.",
        service="Профессиональная гигиена",
        branch="Клиника на Тверской",
        scheduled_at=_dt(90, 11),
        duration_min=45,
        status="completed",
        no_show_risk=3,
        revenue=7000,
        created_at=_dt(92),
    ),
    AppointmentResponse(
        id=uuid.UUID("a1000000-0000-4000-a000-000000000004"),
        external_id="APT-4401",
        patient_id=_pid(1),
        doctor_name="Белова Т.С.",
        service="Лечение кариеса (зуб 36)",
        branch="Клиника на Тверской",
        scheduled_at=_dt(120, 16),
        duration_min=60,
        status="completed",
        no_show_risk=12,
        revenue=12000,
        created_at=_dt(122),
    ),
    AppointmentResponse(
        id=uuid.UUID("a1000000-0000-4000-a000-000000000005"),
        external_id=None,
        patient_id=_pid(1),
        doctor_name="Козлова Е.А.",
        service="Контрольный осмотр (ортодонтия)",
        branch="Клиника на Тверской",
        scheduled_at=_dt(-3, 10),
        duration_min=30,
        status="scheduled",
        no_show_risk=15,
        revenue=None,
        created_at=_dt(0),
    ),
]

_MOCK_COMMS: list[CommunicationBrief] = [
    CommunicationBrief(
        id=uuid.UUID("c1000000-0000-4000-a000-000000000001"),
        channel="telegram",
        direction="inbound",
        type="message",
        content="Здравствуйте! Хочу уточнить время моего следующего приёма.",
        status="done",
        created_at=_dt(1, 9),
    ),
    CommunicationBrief(
        id=uuid.UUID("c1000000-0000-4000-a000-000000000002"),
        channel="telegram",
        direction="outbound",
        type="message",
        content="Анна, ваш приём назначен на 16 апреля в 10:00. Ждём вас!",
        status="done",
        created_at=_dt(1, 10),
    ),
    CommunicationBrief(
        id=uuid.UUID("c1000000-0000-4000-a000-000000000003"),
        channel="novofon",
        direction="inbound",
        type="call",
        content="Звонок по вопросу рассрочки на ортодонтическое лечение.",
        status="done",
        created_at=_dt(10, 14),
    ),
    CommunicationBrief(
        id=uuid.UUID("c1000000-0000-4000-a000-000000000004"),
        channel="telegram",
        direction="inbound",
        type="message",
        content="Можно ли перенести приём на другой день? Не могу в четверг.",
        status="in_progress",
        created_at=_dt(0, 15),
    ),
    CommunicationBrief(
        id=uuid.UUID("c1000000-0000-4000-a000-000000000005"),
        channel="novofon",
        direction="outbound",
        type="call",
        content="Напоминание о визите. Пациентка подтвердила.",
        status="done",
        created_at=_dt(6, 11),
    ),
]

_MOCK_DEALS: list[DealBrief] = [
    DealBrief(
        id=uuid.UUID("d1000000-0000-4000-a000-000000000001"),
        title="Ортодонтия — брекеты",
        stage="treatment",
        amount=180000,
        service="Ортодонтия",
        doctor_name="Козлова Е.А.",
        stage_changed_at=_dt(5),
        created_at=_dt(35),
    ),
    DealBrief(
        id=uuid.UUID("d1000000-0000-4000-a000-000000000002"),
        title="Профессиональная гигиена",
        stage="closed_won",
        amount=7000,
        service="Гигиена",
        doctor_name="Морозов И.П.",
        stage_changed_at=_dt(88),
        created_at=_dt(95),
    ),
]

_MOCK_TASKS: list[TaskBrief] = [
    TaskBrief(
        id=uuid.UUID("b1000000-0000-4000-a000-000000000001"),
        type="confirm_appointment",
        title="Подтвердить визит 16 апреля",
        due_at=_dt(-1, 9),
        is_done=False,
        done_at=None,
        created_at=_dt(0),
    ),
    TaskBrief(
        id=uuid.UUID("b1000000-0000-4000-a000-000000000002"),
        type="followup",
        title="Напомнить о контрольном снимке",
        due_at=_dt(-7, 10),
        is_done=False,
        done_at=None,
        created_at=_dt(2),
    ),
    TaskBrief(
        id=uuid.UUID("b1000000-0000-4000-a000-000000000003"),
        type="callback",
        title="Перезвонить по вопросу рассрочки",
        due_at=_dt(1, 14),
        is_done=True,
        done_at=_dt(1, 15),
        created_at=_dt(2),
    ),
]

_MOCK_AI = AIAnalysis(
    summary="Пациентка проходит ортодонтическое лечение (брекеты). Высокая вовлечённость: "
    "регулярно посещает приёмы, активно общается через Telegram. "
    "Интересуется рассрочкой — может быть чувствительна к цене на следующие этапы. "
    "Рекомендуется предложить программу лояльности и закрепить долгосрочные отношения.",
    barriers=["Чувствительность к цене", "Занятость (переносы приёмов)", "Нет времени на длительные визиты"],
    return_probability=82,
    next_action="Подтвердить визит 16 апреля и предложить оформить рассрочку на оставшийся этап лечения",
)


async def get_patients(
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> PatientListResponse:
    """Return paginated patient list with optional search."""
    items = list(MOCK_PATIENTS)

    if search:
        q = search.lower()
        items = [
            p
            for p in items
            if q in p.name.lower()
            or (p.phone and q in p.phone)
            or (p.email and q in p.email.lower())
        ]

    total = len(items)
    start = (page - 1) * limit
    items = items[start : start + limit]

    return PatientListResponse(items=items, total=total)


async def get_patient_detail(patient_id: uuid.UUID) -> PatientDetailResponse | None:
    """Return full 360 patient card."""
    patient = None
    for p in MOCK_PATIENTS:
        if p.id == patient_id:
            patient = p
            break

    if patient is None:
        return None

    return PatientDetailResponse(
        **patient.model_dump(),
        appointments=_MOCK_APPOINTMENTS,
        communications=_MOCK_COMMS,
        deals=_MOCK_DEALS,
        tasks=_MOCK_TASKS,
        ai_analysis=_MOCK_AI,
    )


async def create_patient(
    name: str,
    phone: str | None = None,
    email: str | None = None,
    birth_date: str | None = None,
    source_channel: str | None = None,
    tags: list[str] | None = None,
) -> PatientResponse:
    new_patient = PatientResponse(
        id=uuid.uuid4(),
        external_id=None,
        name=name,
        phone=phone,
        email=email,
        birth_date=birth_date,
        source_channel=source_channel,
        is_new_patient=True,
        last_visit_at=None,
        total_revenue=0,
        ltv_score=None,
        tags=tags,
        created_at=_now,
    )
    MOCK_PATIENTS.append(new_patient)
    return new_patient


async def update_patient(
    patient_id: uuid.UUID,
    name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    birth_date: str | None = None,
    source_channel: str | None = None,
    tags: list[str] | None = None,
    ltv_score: int | None = None,
) -> PatientResponse | None:
    for i, p in enumerate(MOCK_PATIENTS):
        if p.id == patient_id:
            data = p.model_dump()
            if name is not None:
                data["name"] = name
            if phone is not None:
                data["phone"] = phone
            if email is not None:
                data["email"] = email
            if birth_date is not None:
                data["birth_date"] = birth_date
            if source_channel is not None:
                data["source_channel"] = source_channel
            if tags is not None:
                data["tags"] = tags
            if ltv_score is not None:
                data["ltv_score"] = ltv_score
            updated = PatientResponse(**data)
            MOCK_PATIENTS[i] = updated
            return updated
    return None
