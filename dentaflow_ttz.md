# ТЕХНИЧЕСКОЕ ЗАДАНИЕ
## DentaFlow — Модули 1 и 2
### Для разработки с помощью Claude Code

**Версия:** 1.0  
**Дата:** Апрель 2026  
**Стек:** FastAPI + PostgreSQL + Redis + React + TypeScript + Docker

---

## 0. КОНТЕКСТ И ЦЕЛЬ

Разработать веб-приложение **DentaFlow** — интеллектуальный дашборд управления стоматологической клиникой. Приложение работает поверх МИС 1Denta, не заменяя её, а добавляя коммерческий и управленческий слой.

**Модуль 1 — Единый дашборд руководителя:**  
ИИ-аналитика, воронка пациентов, загрузка врачей, рейтинг администраторов, ежедневный Telegram-отчёт.

**Модуль 2 — Единый центр коммуникаций + CRM-воронка:**  
Единая лента входящих (Telegram, Max/VK, сайт, телефония Novofon), CRM-воронка (канбан), карточка пациента 360°, ИИ-подсказки администратору.

**Деплой:** Timeweb Cloud (VPS Ubuntu 22.04)  
**Пользователей:** 1 клиника, до 10 сотрудников  
**Мобильная версия:** адаптивный дизайн (mobile-first для администраторов)

---

## 1. АРХИТЕКТУРА СИСТЕМЫ

```
┌─────────────────────────────────────────────────┐
│                  КЛИЕНТ (браузер)               │
│         React 18 + TypeScript + Vite            │
│         TailwindCSS + shadcn/ui                 │
└────────────────────┬────────────────────────────┘
                     │ HTTPS / WebSocket
┌────────────────────▼────────────────────────────┐
│              NGINX (reverse proxy)              │
│         SSL termination, static files          │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│           FastAPI (Python 3.11)                 │
│    REST API + WebSocket (realtime events)       │
│    JWT Auth │ Background Tasks │ Webhooks       │
└──────┬──────┬──────────────────┬───────────────┘
       │      │                  │
┌──────▼──┐ ┌─▼──────┐ ┌────────▼──────────────┐
│Postgres │ │ Redis  │ │   Celery Workers       │
│ (main)  │ │(cache/ │ │ - 1Denta sync          │
│         │ │pubsub/ │ │ - Novofon events       │
│         │ │queue)  │ │ - Telegram bot         │
└─────────┘ └────────┘ │ - AI processing        │
                       │ - Daily reports        │
                       └───────────────────────┘
                                │
┌───────────────────────────────▼───────────────┐
│            ВНЕШНИЕ СЕРВИСЫ                    │
│  1Denta CRM API  │  Novofon API  │  OpenAI    │
│  Telegram Bot    │  Max/VK API   │  API       │
└───────────────────────────────────────────────┘
```

---

## 2. СТРУКТУРА ПРОЕКТА

```
dentaflow/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry
│   │   ├── config.py                  # Settings (pydantic-settings)
│   │   ├── database.py                # SQLAlchemy async engine
│   │   ├── dependencies.py            # DI: db, current_user, etc.
│   │   │
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── patient.py
│   │   │   ├── communication.py
│   │   │   ├── deal.py
│   │   │   ├── call.py
│   │   │   └── notification.py
│   │   │
│   │   ├── schemas/                   # Pydantic schemas
│   │   │   ├── auth.py
│   │   │   ├── patient.py
│   │   │   ├── dashboard.py
│   │   │   ├── communication.py
│   │   │   └── deal.py
│   │   │
│   │   ├── routers/                   # FastAPI routers
│   │   │   ├── auth.py                # POST /auth/login, /auth/refresh
│   │   │   ├── dashboard.py           # GET /dashboard/overview
│   │   │   ├── patients.py            # CRUD /patients
│   │   │   ├── communications.py      # GET /communications (feed)
│   │   │   ├── deals.py               # CRUD /deals (CRM pipeline)
│   │   │   ├── calls.py               # GET /calls
│   │   │   ├── webhooks.py            # POST /webhooks/{source}
│   │   │   └── ws.py                  # WebSocket /ws
│   │   │
│   │   ├── services/                  # Business logic
│   │   │   ├── one_denta.py           # 1Denta API client
│   │   │   ├── novofon.py             # Novofon API + webhooks
│   │   │   ├── telegram_bot.py        # Telegram bot (aiogram)
│   │   │   ├── max_vk.py              # Max/VK API client
│   │   │   ├── ai_service.py          # OpenAI GPT-4o integration
│   │   │   ├── dashboard_service.py   # Dashboard KPI aggregation
│   │   │   └── realtime.py            # WebSocket event publisher
│   │   │
│   │   ├── tasks/                     # Celery tasks
│   │   │   ├── celery_app.py
│   │   │   ├── sync_1denta.py         # Periodic 1Denta sync
│   │   │   ├── daily_report.py        # Telegram daily digest
│   │   │   ├── ai_analysis.py         # Async AI processing
│   │   │   └── alerts.py              # Stale lead alerts
│   │   │
│   │   └── utils/
│   │       ├── security.py            # JWT, password hashing
│   │       └── pagination.py
│   │
│   ├── alembic/                       # DB migrations
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx          # Модуль 1: главная
│   │   │   ├── Communications.tsx     # Модуль 2: лента
│   │   │   ├── Pipeline.tsx           # CRM воронка (канбан)
│   │   │   ├── PatientCard.tsx        # Карточка пациента 360°
│   │   │   └── Patients.tsx           # Список пациентов
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── KpiCard.tsx
│   │   │   │   ├── FunnelChart.tsx
│   │   │   │   ├── AIInsightBanner.tsx
│   │   │   │   ├── DoctorsLoad.tsx
│   │   │   │   └── AdminsRating.tsx
│   │   │   ├── communications/
│   │   │   │   ├── FeedItem.tsx
│   │   │   │   ├── FeedFilters.tsx
│   │   │   │   └── QuickReply.tsx
│   │   │   ├── pipeline/
│   │   │   │   ├── KanbanBoard.tsx
│   │   │   │   ├── KanbanColumn.tsx
│   │   │   │   └── DealCard.tsx
│   │   │   └── patient/
│   │   │       ├── PatientHeader.tsx
│   │   │       ├── MedHistory.tsx     # Из 1Denta
│   │   │       ├── CommHistory.tsx    # Звонки + чаты
│   │   │       └── AIAnalysis.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts        # WS connection
│   │   │   ├── useAuth.ts
│   │   │   └── useDashboard.ts
│   │   │
│   │   ├── store/                     # Zustand
│   │   │   ├── authStore.ts
│   │   │   ├── notificationStore.ts
│   │   │   └── communicationsStore.ts
│   │   │
│   │   ├── api/                       # Axios instances + React Query
│   │   │   ├── client.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── communications.ts
│   │   │   └── patients.ts
│   │   │
│   │   └── types/
│   │       └── index.ts
│   │
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── Dockerfile
│
├── nginx/
│   └── nginx.conf
│
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

---

## 3. СХЕМА БАЗЫ ДАННЫХ

```sql
-- Пользователи системы (сотрудники клиники)
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    role        VARCHAR(50) NOT NULL,  -- owner | manager | admin | marketer
    password_hash VARCHAR(255) NOT NULL,
    telegram_chat_id BIGINT,           -- для отчётов
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Пациенты (синхронизируются из 1Denta)
CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id     VARCHAR(100) UNIQUE,   -- ID в 1Denta
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    email           VARCHAR(255),
    birth_date      DATE,
    source_channel  VARCHAR(50),           -- telegram|call|site|max|referral
    is_new_patient  BOOLEAN DEFAULT true,
    last_visit_at   TIMESTAMPTZ,
    total_revenue   DECIMAL(12,2) DEFAULT 0,
    ltv_score       INTEGER,               -- AI-оценка LTV (0-100)
    tags            TEXT[],
    synced_at       TIMESTAMPTZ,
    raw_1denta_data JSONB,                 -- полные данные из 1Denta
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Коммуникации (единая лента: звонки, сообщения, заявки)
CREATE TABLE communications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID REFERENCES patients(id),
    channel         VARCHAR(50) NOT NULL,  -- telegram|novofon|max|site|manual
    direction       VARCHAR(20) NOT NULL,  -- inbound|outbound
    type            VARCHAR(30) NOT NULL,  -- message|call|form|missed_call
    content         TEXT,                  -- текст сообщения или транскрипция
    media_url       VARCHAR(500),          -- ссылка на запись звонка
    duration_sec    INTEGER,               -- для звонков
    status          VARCHAR(30) DEFAULT 'new', -- new|in_progress|done|ignored
    priority        VARCHAR(20) DEFAULT 'normal', -- urgent|high|normal|low
    ai_tags         TEXT[],                -- AI-теги: горячий_лид|возражение|цена
    ai_summary      TEXT,                  -- AI-краткое резюме
    ai_next_action  TEXT,                  -- AI-рекомендуемый следующий шаг
    external_id     VARCHAR(100),          -- ID во внешней системе
    assigned_to     UUID REFERENCES users(id),
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Сделки / CRM воронка
CREATE TABLE deals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID REFERENCES patients(id),
    title           VARCHAR(255) NOT NULL,
    stage           VARCHAR(50) NOT NULL DEFAULT 'new',
                    -- new|contact|negotiation|scheduled|treatment|closed_won|closed_lost
    amount          DECIMAL(12,2),
    service         VARCHAR(255),
    doctor_name     VARCHAR(255),
    branch          VARCHAR(255),
    assigned_to     UUID REFERENCES users(id),
    source_channel  VARCHAR(50),
    notes           TEXT,
    lost_reason     VARCHAR(255),
    stage_changed_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- История изменений стадии сделки
CREATE TABLE deal_stage_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id     UUID REFERENCES deals(id),
    from_stage  VARCHAR(50),
    to_stage    VARCHAR(50),
    changed_by  UUID REFERENCES users(id),
    comment     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Расписание (синхронизируется из 1Denta)
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id     VARCHAR(100) UNIQUE,
    patient_id      UUID REFERENCES patients(id),
    doctor_name     VARCHAR(255),
    doctor_id       VARCHAR(100),
    service         VARCHAR(255),
    branch          VARCHAR(255),
    scheduled_at    TIMESTAMPTZ,
    duration_min    INTEGER DEFAULT 30,
    status          VARCHAR(30),   -- scheduled|confirmed|completed|cancelled|no_show
    no_show_risk    INTEGER,       -- AI: 0-100, риск неявки
    revenue         DECIMAL(12,2),
    synced_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Задачи (TODO для администраторов)
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id  UUID REFERENCES patients(id),
    deal_id     UUID REFERENCES deals(id),
    comm_id     UUID REFERENCES communications(id),
    assigned_to UUID REFERENCES users(id),
    created_by  UUID REFERENCES users(id),
    type        VARCHAR(50),   -- callback|followup|confirm_appointment|other
    title       VARCHAR(255),
    due_at      TIMESTAMPTZ,
    done_at     TIMESTAMPTZ,
    is_done     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Уведомления (алерты)
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    type        VARCHAR(50),   -- stale_lead|missed_call|deal_stuck|ai_alert
    title       VARCHAR(255),
    body        TEXT,
    link        VARCHAR(500),
    is_read     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_communications_patient ON communications(patient_id);
CREATE INDEX idx_communications_status ON communications(status);
CREATE INDEX idx_communications_created ON communications(created_at DESC);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_patient ON deals(patient_id);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_external ON patients(external_id);
```

---

## 4. API ЭНДПОИНТЫ

### 4.1 Аутентификация
```
POST /api/v1/auth/login          # { email, password } → { access_token, refresh_token, user }
POST /api/v1/auth/refresh        # { refresh_token } → { access_token }
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### 4.2 Дашборд (Модуль 1)
```
GET /api/v1/dashboard/overview?period=day|week|month
    → {
        kpi: {
          new_leads: int, appointments_created: int,
          appointments_confirmed: int, no_shows: int,
          leads_lost: int, revenue_planned: decimal,
          conversion_rate: float
        },
        funnel: [ { stage, count, pct } ],
        sources: [ { channel, leads, conversion, cpl } ],
        doctors_load: [ { name, spec, load_pct } ],
        admins_rating: [ { name, conversion, calls, score } ],
        ai_insights: {
          summary: str,
          chips: [ { type, text, action } ],
          recommendations: [ { title, body, action_url } ]
        }
      }

GET /api/v1/dashboard/revenue?period=day|week|month
    → { by_period: [...], by_service: [...], total, forecast }
```

### 4.3 Коммуникации (Модуль 2 — лента)
```
GET  /api/v1/communications?
        status=new|in_progress|done
        &channel=telegram|novofon|max|site
        &priority=urgent|high|normal
        &page=1&limit=20
    → { items: [Communication], total, unread_count }

GET  /api/v1/communications/{id}
PATCH /api/v1/communications/{id}   # { status, assigned_to }
POST /api/v1/communications/{id}/reply  # { channel, text }
GET  /api/v1/communications/stats   # счётчики по фильтрам
```

### 4.4 CRM Воронка (Сделки)
```
GET  /api/v1/deals?stage=...&assigned_to=...
    → { stages: { [stage]: { deals: [...], count, total_amount } } }

POST /api/v1/deals
    body: { patient_id, title, stage, amount, service, assigned_to }

GET  /api/v1/deals/{id}
PATCH /api/v1/deals/{id}
    body: { stage?, amount?, notes?, lost_reason? }
DELETE /api/v1/deals/{id}

GET /api/v1/deals/{id}/history
```

### 4.5 Пациенты
```
GET  /api/v1/patients?search=...&page=1&limit=20
GET  /api/v1/patients/{id}
    → {
        patient,
        appointments: [...],     # из 1Denta
        communications: [...],   # вся история
        deals: [...],
        tasks: [...],
        ai_analysis: { summary, barriers, next_action, return_probability }
      }

POST /api/v1/patients
PATCH /api/v1/patients/{id}
```

### 4.6 Задачи
```
GET  /api/v1/tasks?assigned_to=me&is_done=false
POST /api/v1/tasks    # { patient_id, type, title, due_at, assigned_to }
PATCH /api/v1/tasks/{id}
```

### 4.7 WebHooks (входящие события)
```
POST /api/v1/webhooks/novofon      # Novofon: call started/ended/missed
POST /api/v1/webhooks/telegram     # Telegram Bot: incoming messages
POST /api/v1/webhooks/max          # Max/VK: incoming messages
POST /api/v1/webhooks/site         # Форма с сайта

# Все webhook'и защищены HMAC или secret token
```

### 4.8 WebSocket (real-time)
```
WS /api/v1/ws?token={jwt}

# Серверные события:
{ type: "new_communication", data: Communication }
{ type: "new_notification", data: Notification }
{ type: "deal_updated", data: Deal }
{ type: "kpi_updated", data: KpiSnapshot }
```

---

## 5. ИНТЕГРАЦИИ

### 5.1 1Denta CRM API
**Документация:** `https://crmexchange.1denta.ru/docs/swagger/`  
**Получение ключа:** клиент запрашивает у поддержки 1Denta (`support@1denta.ru`), просит выдать CRM API Key.

```python
# services/one_denta.py
class OneDentaService:
    BASE_URL = "https://crmexchange.1denta.ru/api/v1"
    
    async def get_patients(self, updated_since: datetime) -> list[dict]
    async def get_appointments(self, date_from: date, date_to: date) -> list[dict]
    async def get_patient_by_phone(self, phone: str) -> dict | None
    async def create_appointment(self, data: dict) -> dict
    async def update_appointment_status(self, external_id: str, status: str)
```

**Стратегия синхронизации:**
- Celery beat: полная синхронизация каждые 15 минут
- При входящем обращении: точечный запрос по номеру телефона
- При создании/изменении записи из DentaFlow: push в 1Denta

### 5.2 Novofon
**Документация:** `https://novofon.com/api/`

```python
# services/novofon.py
class NovofonService:
    # Входящий WebHook при звонке
    async def handle_call_event(self, event: dict)
        # event.type: call_start | call_end | missed
        # event.caller_num, event.callee_num, event.duration
        # event.recording_url
    
    # Исходящий звонок (click-to-call)
    async def make_call(self, from_num: str, to_num: str) -> dict
    
    # Получить запись разговора
    async def get_recording(self, call_id: str) -> bytes
```

**При входящем звонке:**
1. Webhook → найти пациента по номеру в БД или в 1Denta
2. Создать `Communication(channel=novofon, type=call)`
3. После окончания: обновить duration, recording_url
4. Запустить AI-транскрипцию асинхронно
5. Push через WebSocket в браузер

### 5.3 Telegram Bot (aiogram 3.x)
```python
# services/telegram_bot.py

# Входящие сообщения от пациентов:
@router.message()
async def handle_patient_message(msg: Message):
    # Найти пациента по telegram_id или создать нового
    # Создать Communication(channel=telegram, type=message)
    # Показать в ленте
    # AI: приоритизировать, добавить теги

# Исходящие: ответ администратора через интерфейс DentaFlow
async def send_reply(chat_id: int, text: str)

# Ежедневный отчёт собственнику:
async def send_daily_report(owner_chat_id: int, report: DailyReport)
```

### 5.4 OpenAI GPT-4o
```python
# services/ai_service.py

class AIService:
    
    async def generate_daily_insights(self, kpi: dict) -> AIInsights:
        """Генерирует управленческие выводы для дашборда"""
    
    async def analyze_patient(self, patient: Patient, 
                               history: list) -> PatientAnalysis:
        """Анализирует пациента: вероятность возврата, барьеры, след. шаг"""
    
    async def prioritize_communication(self, comm: Communication) -> Priority:
        """Определяет приоритет входящего обращения"""
    
    async def suggest_reply(self, comm: Communication, 
                            patient: Patient) -> list[str]:
        """Предлагает 2-3 варианта ответа администратору"""
    
    async def transcribe_and_analyze_call(self, audio_url: str) -> CallAnalysis:
        """Транскрибирует звонок и анализирует (Whisper → GPT-4o)"""
```

---

## 6. КОНФИГУРАЦИЯ ОКРУЖЕНИЯ

```env
# .env.example

# App
APP_ENV=production
SECRET_KEY=<32-char-random-string>
ALLOWED_ORIGINS=https://yourdomain.com

# Database
DATABASE_URL=postgresql+asyncpg://dentaflow:password@postgres:5432/dentaflow
REDIS_URL=redis://redis:6379/0

# 1Denta
ONE_DENTA_API_URL=https://crmexchange.1denta.ru/api/v1
ONE_DENTA_API_KEY=<from-1denta-support>

# Novofon
NOVOFON_API_KEY=<from-novofon-dashboard>
NOVOFON_WEBHOOK_SECRET=<random-secret>
NOVOFON_ACCOUNT_NUMBER=<clinic-phone-number>

# Telegram
TELEGRAM_BOT_TOKEN=<from-botfather>
TELEGRAM_WEBHOOK_SECRET=<random-secret>
OWNER_TELEGRAM_CHAT_ID=<owner-chat-id>

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Max/VK
MAX_API_KEY=<from-vk-api>
MAX_CONFIRMATION_TOKEN=<from-vk-callback>

# Timeweb Cloud
DOMAIN=dentaflow.clinic
SSL_EMAIL=admin@dentaflow.clinic
```

---

## 7. DOCKER COMPOSE

```yaml
# docker-compose.prod.yml
version: '3.9'
services:

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - certbot_data:/etc/letsencrypt
      - frontend_dist:/usr/share/nginx/html
    depends_on: [backend]

  backend:
    build: ./backend
    env_file: .env
    depends_on: [postgres, redis]
    restart: always
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

  celery_worker:
    build: ./backend
    env_file: .env
    depends_on: [postgres, redis]
    restart: always
    command: celery -A app.tasks.celery_app worker --loglevel=info -Q default,ai,sync

  celery_beat:
    build: ./backend
    env_file: .env
    depends_on: [postgres, redis]
    restart: always
    command: celery -A app.tasks.celery_app beat --loglevel=info

  telegram_bot:
    build: ./backend
    env_file: .env
    depends_on: [postgres, redis]
    restart: always
    command: python -m app.services.telegram_bot

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: dentaflow
      POSTGRES_USER: dentaflow
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: always

volumes:
  postgres_data:
  redis_data:
  certbot_data:
  frontend_dist:
```

---

## 8. ЗАВИСИМОСТИ

### Backend (requirements.txt)
```
fastapi==0.111.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
alembic==1.13.1
pydantic==2.7.1
pydantic-settings==2.2.1
redis[asyncio]==5.0.4
celery[redis]==5.4.0
aiogram==3.7.0
httpx==0.27.0
openai==1.30.0
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
pytest==8.2.2
pytest-asyncio==0.23.7
```

### Frontend (package.json key deps)
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.23.1",
  "typescript": "^5.4.5",
  "@tanstack/react-query": "^5.40.0",
  "zustand": "^4.5.2",
  "axios": "^1.7.2",
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "tailwindcss": "^3.4.3",
  "recharts": "^2.12.7",
  "date-fns": "^3.6.0",
  "react-hot-toast": "^2.4.1"
}
```

---

## 9. РОЛИ И ПРАВА ДОСТУПА

```
OWNER (собственник):
  - Полный доступ ко всему
  - Видит KPI, аналитику, рейтинги
  - Получает daily report в Telegram

MANAGER (управляющий):
  - Всё кроме настроек системы
  - Видит рейтинги администраторов

ADMIN (администратор):
  - Лента коммуникаций (только свои + неназначенные)
  - CRM воронка (только свои сделки)
  - Карточки пациентов
  - Нет доступа к рейтингам других
  - Нет финансовых данных

MARKETER (маркетолог):
  - Только дашборд источников и конверсий
  - Нет доступа к коммуникациям
```

---

## 10. ПОШАГОВЫЙ ПЛАН РАЗРАБОТКИ ДЛЯ CLAUDE CODE

Claude Code должен реализовывать проект в следующем порядке:

### ШАГ 1 — Инфраструктура и база (2-3 дня)
```
1. Создать структуру проекта (все папки и файлы-заглушки)
2. Настроить docker-compose.yml (postgres, redis, backend, frontend)
3. Создать FastAPI app с health-check эндпоинтом
4. Настроить SQLAlchemy async + alembic
5. Создать все модели БД (models/)
6. Запустить первую миграцию
7. Настроить pydantic-settings с .env
```

### ШАГ 2 — Аутентификация (1 день)
```
1. POST /auth/login → JWT access + refresh tokens
2. POST /auth/refresh
3. GET /auth/me
4. Middleware: проверка JWT на все защищённые маршруты
5. Роли: owner | manager | admin | marketer
6. Frontend: страница Login, хранение токена в localStorage
7. ProtectedRoute компонент
```

### ШАГ 3 — Интеграция 1Denta (2 дня)
```
1. OneDentaService: клиент к API
2. Celery task: sync_patients_from_1denta (каждые 15 мин)
3. Celery task: sync_appointments_from_1denta (каждые 15 мин)
4. Upsert пациентов в локальную БД
5. Обработка ошибок: лог, retry, алерт если API недоступен
6. Endpoint GET /patients — с данными из локальной БД
```

### ШАГ 4 — Дашборд руководителя (3 дня)
```
1. GET /dashboard/overview (агрегация KPI из БД)
2. AI insights: запрос к GPT-4o с контекстом KPI
3. Frontend: страница Dashboard
   - 6 KPI-карточек с трендами
   - Воронка (funnel chart — recharts)
   - Источники лидов (таблица)
   - Загрузка врачей (прогресс-бары)
   - Рейтинг администраторов
   - AI-баннер с выводами
4. Переключатель период: день/неделя/месяц
5. Адаптив для мобильного
```

### ШАГ 5 — Телефония Novofon (2 дня)
```
1. POST /webhooks/novofon — обработка call events
2. Поиск пациента по номеру телефона (БД → 1Denta API)
3. Создание Communication(type=call|missed_call)
4. Автозадача на перезвон при missed_call
5. Уведомление через WebSocket в браузер
6. Frontend: тост-уведомление при входящем звонке
```

### ШАГ 6 — Telegram Bot (2 дня)
```
1. aiogram 3.x — webhook режим
2. Входящее сообщение → создать Communication
3. Поиск/создание пациента по telegram_id
4. AI: приоритет + теги + краткое резюме
5. WebSocket push в браузер
6. Исходящий ответ из интерфейса → bot.send_message()
7. Celery task: daily_report каждый день в 20:00
```

### ШАГ 7 — Лента коммуникаций (3 дня)
```
1. GET /communications (с фильтрами, пагинация)
2. PATCH /communications/{id} (статус, assigned_to)
3. POST /communications/{id}/reply
4. Frontend: страница Communications
   - Список с фильтрами по каналу/статусу/приоритету
   - FeedItem с аватаром канала, превью, теги
   - При клике: правая панель с историей + поле ответа
   - AI-подсказки: 2 варианта ответа
   - Бейджи: "Без ответа N мин", "Горячий", "Срочно"
5. Real-time: новые сообщения появляются без перезагрузки
6. Мобильный: полноэкранный чат
```

### ШАГ 8 — CRM Воронка (2 дня)
```
1. CRUD /deals
2. PATCH /deals/{id} — смена стадии + история
3. Frontend: страница Pipeline (канбан)
   - 6 колонок: Новые | Контакт | Переговоры | Записан | Лечение | Закрыто
   - Drag-and-drop (@dnd-kit)
   - Сумма и кол-во в заголовке колонки
   - Создание сделки из коммуникации (кнопка в FeedItem)
4. Потенциал выручки открытых сделок
5. Алерт: сделка в стадии > 3 дней без движения
```

### ШАГ 9 — Карточка пациента 360° (2 дня)
```
1. GET /patients/{id} — сборная карточка
2. Frontend: PatientCard
   - Header: ФИО, телефон, теги, источник
   - Вкладка "1Denta": история визитов, планы лечения
   - Вкладка "Коммуникации": все звонки, сообщения
   - Вкладка "CRM": сделки, история стадий
   - AI-блок: вероятность возврата, барьеры, рекомендация
3. Кнопки: Записать | Позвонить | Написать | Создать сделку
```

### ШАГ 10 — Max/VK интеграция (1 день)
```
1. MAX API: Callback API (аналог Telegram)
2. POST /webhooks/max — входящие сообщения
3. Исходящие ответы через API
4. Добавить в ленту коммуникаций
```

### ШАГ 11 — AI-подсказки администратору (1 день)
```
1. POST /api/v1/ai/suggest-reply
   body: { comm_id }
   → { suggestions: [str, str] }
2. POST /api/v1/ai/patient-analysis
   body: { patient_id }
   → { summary, return_probability, barriers, next_action }
3. Frontend: показывать в правой панели чата
```

### ШАГ 12 — Уведомления и алерты (1 день)
```
1. Celery task: каждые 5 мин проверять stale leads (>15 мин без ответа)
2. Создавать Notification, push через WebSocket
3. Колокольчик в хедере с бейджем
4. Выпадающий список уведомлений
```

### ШАГ 13 — Деплой на Timeweb Cloud (1 день)
```
1. Создать VPS Ubuntu 22.04 (рекомендую 4 CPU / 8 GB RAM)
2. Установить Docker + Docker Compose
3. Настроить DNS (A-запись домена)
4. Получить SSL (certbot / Let's Encrypt)
5. Клонировать репозиторий, заполнить .env
6. docker-compose -f docker-compose.prod.yml up -d
7. Прогнать alembic upgrade head
8. Создать первого пользователя (owner)
```

---

## 11. ВАЖНЫЕ ТЕХНИЧЕСКИЕ РЕШЕНИЯ

### Real-time (WebSocket)
- Один WebSocket на пользователя при входе
- Redis pub/sub как шина событий между воркерами и WS-сервером
- Формат события: `{ type, data, timestamp }`
- При разрыве соединения: автоматический реконнект на фронте

### AI-запросы (оптимизация стоимости)
- Insights для дашборда: 1 запрос в 30 мин, кешировать в Redis
- Анализ пациента: по запросу + кеш 1 час
- Подсказки ответа: по запросу, без кеша
- Приоритизация коммуникаций: batch-обработка раз в 5 мин

### Синхронизация 1Denta
- Использовать `updated_since` параметр для инкрементальной синхронизации
- При конфликте данных: 1Denta — источник истины для медданных, DentaFlow — для CRM
- Если API 1Denta недоступен: работать с кешированными данными, алерт в Telegram собственнику

### Безопасность
- Все webhook-эндпоинты проверяют HMAC-подпись или secret token
- JWT: access_token 15 мин, refresh_token 30 дней
- Пароли: bcrypt с cost factor 12
- Rate limiting на auth-эндпоинты (Redis)
- CORS: только разрешённые домены

---

## 12. КРИТЕРИИ ГОТОВНОСТИ (Definition of Done)

**Модуль 1 считается готовым когда:**
- [ ] Дашборд отображает реальные данные из 1Denta
- [ ] KPI обновляются при смене периода
- [ ] AI-блок генерирует актуальные выводы
- [ ] Ежедневный отчёт приходит в Telegram собственника
- [ ] Страница адаптирована под мобильный

**Модуль 2 считается готовым когда:**
- [ ] Входящий звонок Novofon появляется в ленте за ≤3 сек
- [ ] Входящее сообщение Telegram появляется за ≤2 сек
- [ ] Ответ из интерфейса доставляется в Telegram/Max
- [ ] CRM канбан работает drag-and-drop
- [ ] Карточка пациента показывает данные из 1Denta + коммуникации
- [ ] AI предлагает варианты ответа
- [ ] Алерт при пропущенном звонке создаёт задачу автоматически

---
