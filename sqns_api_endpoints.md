# SQNS CRM Exchange API v2 — справочник эндпоинтов

Базовый URL: `{{BASE_URL}}`
Авторизация: `Authorization: Bearer {{TOKEN}}` (JWT, получается через `/api/v1/auth`)

Дополнительно для интеграции:
- **ApiKey** — уникальный идентификатор ключа интегратора. Генерируется техподдержкой SQNS через admin-панель и привязывается к аккаунту клиента. Без него токен не выдаётся.
- Токен передаётся в заголовке `Authorization` после ключевого слова `Bearer` (Bearer authentication).
- По JWT определяется организация (`orgId`) и привязанный сотрудник.

---

## 1. АВТОРИЗАЦИЯ

### POST /api/v1/auth — получение JWT-токена

**Headers:**
```
Content-Type: application/json
```

**Request body:**
```json
{
  "email": "example@email.ru",
  "password": "password"
}
```

**Response:**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 119732,
    "orgId": 60519,
    "name": "Сергеев Петр Андреевич",
    "phone": "+7(777)777-77-77",
    "email": "teterin-stepanteterin@yandex.ru"
  }
}
```

**Примечание:** для получения токена аккаунт должен быть предварительно привязан к ApiKey (делается на стороне SQNS техподдержкой).

### Ошибки авторизации
| Код | Сообщение | Действие |
|---|---|---|
| 400 | No Bearer token | Токен не передан — проверить заголовок |
| 401 | User token not found | Токен не найден — проверить передачу |
| 401 | Invalid user token | Токен невалидный или повреждён — получить новый через `/auth` |
| 401 | User token deactivated | Ключ деактивирован — обратиться в техподдержку |
| 500 | Server error | Серверная ошибка |

---

## 2. ОНЛАЙН-ЗАПИСЬ

### GET /api/v2/resource — список сотрудников, доступных для записи

**Response:**
```json
{
  "resources": [
    {
      "id": "3",
      "title": "Вячеслав Вяткин",
      "description": "Администратор",
      "image": ""
    },
    {
      "id": "28",
      "title": "Иван Иванов",
      "description": null,
      "image": ""
    }
  ]
}
```

---

### GET /api/v2/booking/service — список услуг для онлайн-записи

В выдачу попадают только услуги, у которых есть продолжительность и привязанные сотрудники.

**Response:**
```json
{
  "services": [
    {
      "id": "1",
      "title": "Стрижка женская",
      "description": "",
      "category": "Парикмахерский зал",
      "image": "",
      "durationSeconds": 3600,
      "price": {
        "currencyCode": "RUB",
        "range": [500, 500]
      },
      "resources": [
        { "id": "3", "durationSeconds": 3600 },
        { "id": "28", "durationSeconds": 3600 }
      ]
    }
  ]
}
```

---

### GET /api/v2/booking/service/{id} — информация об услуге по id

**Path params:** `id` — идентификатор услуги.

**Response:**
```json
{
  "service": {
    "id": "1",
    "title": "Стрижка женская",
    "description": "",
    "category": "Парикмахерский зал",
    "image": "",
    "durationSeconds": 3600,
    "price": {
      "currencyCode": "RUB",
      "range": [500, 500]
    },
    "resources": [
      { "id": "3", "durationSeconds": 3600 },
      { "id": "28", "durationSeconds": 3600 }
    ]
  }
}
```

---

### GET /api/v2/resource/{resourceId}/date — список доступных дат для записи

**Path params:** `resourceId` — id сотрудника.

**Query params:**
- `serviceIds[]` (array, обязателен) — список id услуг
- `from` (string, YYYY-MM-DD) — начало диапазона
- `to` (string, YYYY-MM-DD) — конец диапазона

**Пример:** `/api/v2/resource/3/date?serviceIds[]=2&from=2022-08-25&to=2022-08-28`

**Response:**
```json
{
  "availableDates": [
    { "date": "2022-08-25" },
    { "date": "2022-08-26" },
    { "date": "2022-08-27" },
    { "date": "2022-08-28" }
  ]
}
```

---

### GET /api/v2/resource/{resourceId}/time — список доступных слотов на дату

**Path params:** `resourceId` — id сотрудника.

**Query params:**
- `serviceIds[]` (array, обязателен) — список id услуг
- `date` (string, YYYY-MM-DD) — дата

**Пример:** `/api/v2/resource/3/time?serviceIds[]=2&date=2022-08-25`

**Response:**
```json
{
  "availableTimeSlots": [
    { "datetime": "2022-08-25T16:45:00+05:00" },
    { "datetime": "2022-08-25T17:00:00+05:00" },
    { "datetime": "2022-08-25T17:15:00+05:00" }
  ]
}
```

---

### POST /api/v2/visit — создание визита (записи)

Если клиент с таким номером телефона уже существует — визит привяжется к нему.

**Request body:**
```json
{
  "visit": {
    "user": {
      "name": "Test",
      "phone": "+77777777777",
      "email": "as@somemail.ru"
    },
    "comment": "Создано",
    "appointment": {
      "serviceIds": ["8"],
      "resourceId": "3",
      "datetime": "2022-08-25T14:00:00+05:00"
    }
  }
}
```

**Response:**
```json
{
  "visit": {
    "id": 1081,
    "serviceIds": ["8"],
    "resourceId": "3",
    "datetime": "2022-08-29T14:00:00+05:00"
  }
}
```

---

### PUT /api/v2/visit/{id} — обновление визита

**Path params:** `id` — id визита.

**Ограничения:** можно изменить только `comment` и `datetime`. Прошедшие визиты и визиты в статусе «клиент пришёл» изменять нельзя.

**Request body:**
```json
{
  "comment": "Перенос",
  "datetime": "2022-08-28T17:00:00+05:00"
}
```

**Response:**
```json
{
  "visit": {
    "id": [1077],
    "serviceIds": ["8"],
    "resourceId": "3",
    "datetime": "2022-08-28T17:00:00+05:00"
  }
}
```

---

### DELETE /api/v2/visit/{id} — отмена/удаление визита

**Path params:** `id` — id визита.

**Ограничения:** прошедшие визиты и визиты в статусе «клиент пришёл» удалять нельзя.

---

### GET /api/v2/client/phone/{phone} — клиент по номеру телефона

**Path params:** `phone` — номер телефона в формате `+7(777)777-77-77` (URL-encoded).

**Response:**
```json
{
  "client": {
    "id": 7396,
    "name": "Абрамов test Иванович",
    "phone": "+7(777)777-77-77",
    "sex": 0,
    "birthDate": "10.03.1987",
    "comment": null,
    "totalArrival": "6050.00",
    "type": "noGroup"
  }
}
```

---

### GET /api/v2/client/{id} — клиент по id (расширенная карточка)

**Path params:** `id` — id клиента в системе.

**Response:**
```json
{
  "client": {
    "id": 1,
    "name": "Физическое лицо",
    "firstname": "",
    "lastname": "Физическое лицо",
    "patronymic": "",
    "phone": "",
    "additionalPhone": "",
    "sex": 0,
    "birthDate": null,
    "comment": "",
    "totalArrival": "500.00",
    "type": null,
    "visitsCount": 1,
    "tags": [],
    "email": "",
    "passportData": null,
    "passportDataDetailed": {
      "serialDocument": null,
      "numberDocument": null,
      "dateOfIssue": null,
      "issuingAuthority": null
    }
  }
}
```

---

## 3. ВЫГРУЗКА ДАННЫХ

### Общие правила

- Работает в пределах одной организации (определяется по JWT).
- Цены — строки в валюте организации (RUB / USD / EUR и т.д.).
- Время — относительно часового пояса организации.
- **Пагинация** через query-параметры:
  - `page` — номер страницы
  - `peerPage` — размер страницы (рекомендуется ≤ 100)
- Максимальное время выгрузки ~60 секунд. Для крупных сущностей (визиты) учитывать.

---

### GET /api/v2/visit — список визитов

**Query params:**
- `dateFrom` (YYYY-MM-DD) — начало периода
- `dateTill` (YYYY-MM-DD) — конец периода
- `page`, `peerPage` — пагинация

**Лимит:** до 100 визитов за один запрос.

**Пример:** `/api/v2/visit?dateFrom=2023-04-26&dateTill=2023-11-30`

**Response (сокращённо):**
```json
{
  "data": [
    {
      "id": 9,
      "resourceId": 2,
      "services": [
        {
          "id": 3,
          "name": "00\\а Ремонт",
          "paySum": 500,
          "price": "500.00",
          "discount": 0,
          "amount": 1
        }
      ],
      "commodities": [],
      "subscriptions": [],
      "certificates": [],
      "totalPrice": "500.00",
      "totalCost": "500.00",
      "client": 1,
      "clientData": {
        "id": 1,
        "name": "Физическое лицо",
        "firstname": "",
        "lastname": "Физическое лицо",
        "patronymic": "",
        "phone": "",
        "additionalPhone": "",
        "sex": 0,
        "birthDate": null,
        "comment": "",
        "totalArrival": "500.00",
        "type": null,
        "visitsCount": 1,
        "tags": [],
        "email": "",
        "passportData": null
      },
      "datetime": "2023-11-07 14:00:00",
      "comment": "",
      "master_requested": true,
      "attendance": 1,
      "deleted": false,
      "online": false,
      "author": "Автор",
      "organization": { "name": "Имя орг", "id": 61542 },
      "create_date": "2023-11-07 14:37:30",
      "update_date": "2023-11-07 14:37:30"
    }
  ],
  "meta": {
    "page": 1,
    "lastPage": 1,
    "maxPerPage": 20
  }
}
```

**Поле `attendance`:** `-1` — отменён, `0` — не подтверждён, `1` — клиент пришёл, `2` — подтверждён.
**Поле `author`:** `'Онлайн-запись' | 'mobile' | 'chatbot' | 'неизвестен'` или произвольное имя сотрудника.

---

### GET /api/v2/service — список услуг

**Query params:** `page`, `peerPage`.

**Особенность:** даже у услуг с фиксированной ценой поле `range` всегда заполнено двумя одинаковыми значениями, например `["300.00", "300.00"]`.

**Response (сокращённо):**
```json
{
  "data": [
    {
      "id": "1",
      "title": "Стрижка мужская",
      "description": null,
      "category": "Парикмахерский зал",
      "durationSeconds": 3600,
      "price": {
        "currencyCode": "RUB",
        "range": ["300.00", "300.00"]
      }
    }
  ],
  "meta": { "page": 1, "lastPage": 1, "maxPerPage": 20 }
}
```

---

### GET /api/v2/client — список клиентов

**Query params:** `page`, `peerPage`.

**Response (сокращённо):**
```json
{
  "data": [
    {
      "id": 2,
      "name": "Манилов Георгий Георгиевич",
      "firstname": "Георгий",
      "lastname": "Манилов",
      "patronymic": "Георгиевич",
      "phone": "+7(777)777-77-77",
      "additionalPhone": "",
      "sex": 1,
      "birthDate": "03.11.1986",
      "comment": "коментарий",
      "totalArrival": "0.00",
      "type": null,
      "visitsCount": 0,
      "tags": [],
      "email": "77777@77.com",
      "passportData": "66 55 444321",
      "passportDataDetailed": {
        "serialDocument": null,
        "numberDocument": null,
        "dateOfIssue": null,
        "issuingAuthority": null
      }
    }
  ],
  "meta": { "page": 1, "lastPage": 3, "maxPerPage": 20 }
}
```

**Поле `sex`:** `0` — другое/не указано, `1` — мужской, `2` — женский.
**Поле `type`:** `'new' | 'potential' | 'noGroup' | null`.

---

### GET /api/v2/commodity — список товаров

**Query params:** `page`, `peerPage`.

**Response:**
```json
{
  "data": [
    {
      "id": "1",
      "title": "Зубная паста",
      "description": null,
      "category": "Гигиена полости рта",
      "price": "100.00",
      "article": null
    },
    {
      "id": "2",
      "title": "Ополаскиватель для полости рта",
      "description": null,
      "category": "Гигиена полости рта",
      "price": "150.00",
      "article": null
    }
  ],
  "meta": { "page": 1, "lastPage": 1, "maxPerPage": 20 }
}
```

---

## 4. ВЕБХУКИ

При создании / изменении / удалении сущностей в CRM на указанные URL отправляется обновлённый payload.

**Поддерживаемые типы сущностей:** `visit`, `client`, `service`, `commodity` (товар).

### POST /api/v2/hook_settings — подписка на вебхуки

**ВАЖНО:** при отправке нового списка все предыдущие хуки удаляются. Передавайте полный список URL.

**Request body:**
```json
{
  "urls": [
    "https://eozi2qpczsut8qj.m.pipedream.net"
  ]
}
```

---

### Payload: Визит (object: "visit")

```json
{
  "object": "visit",
  "type": "update | create",
  "orgId": "1234",
  "orgName": "Russia",
  "product": "arnica | denta | clinica",
  "visit": {
    "id": 1,
    "resourceId": 1,
    "services": [
      {
        "id": 1,
        "name": "Топ услуга",
        "paySum": "100.50",
        "price": "100.50",
        "discount": "0",
        "amount": 1.0
      }
    ],
    "commodities": [
      {
        "id": 1,
        "name": "Топ товар",
        "paySum": "100.50",
        "price": "100.50",
        "discount": "0",
        "amount": 1.0
      }
    ],
    "subscriptions": [
      {
        "id": 1,
        "name": "Топ абонемент",
        "paySum": "100.50",
        "price": "100.50",
        "discount": "0",
        "amount": 1.0
      }
    ],
    "certificates": [
      {
        "id": 1,
        "name": "Топ сертификат",
        "paySum": "100.50",
        "price": "100.50",
        "discount": "0",
        "amount": 1.0
      }
    ],
    "totalPrice": "402.00",
    "totalCost": "402.00",
    "client": 1,
    "clientData": {
      "id": 1,
      "name": "Иванов Петр Васильевич",
      "firstname": "Петр",
      "lastname": "Иванов",
      "patronymic": "Васильевич",
      "phone": "+79995870011",
      "additionalPhone": "",
      "sex": 1,
      "birthDate": "12.05.2000",
      "comment": "Спокойный, адекватный",
      "totalArrival": "100.50",
      "type": "potential",
      "visitsCount": 1,
      "tags": ["через друзей"],
      "email": "batuhno@somemail.pro",
      "passportData": "",
      "address": "",
      "passportDataDetailed": {
        "serialDocument": "",
        "numberDocument": "",
        "dateOfIssue": "",
        "issuingAuthority": ""
      },
      "medicalClientData": {
        "documentType": "",
        "serialDocument": "",
        "numberDocument": "",
        "dateOfIssue": "",
        "issuingAuthority": ""
      }
    },
    "datetime": "2024-11-03 12:30:00",
    "comment": "",
    "master_requested": true,
    "attendance": 0,
    "deleted": false,
    "online": false,
    "author": "Онлайн-запись",
    "organization": { "name": "Russia", "id": 1 },
    "create_date": "2024-11-01 15:35:20",
    "update_date": "2024-11-01 15:35:20"
  }
}
```

**Примечания по полям:**
- `passportDataDetailed` — для продукта `arnica`.
- `medicalClientData` — для продуктов `denta`, `clinica` (актуально для DentaFlow).
- `attendance`: `-1` отменён, `0` не подтверждён, `1` клиент пришёл, `2` подтверждён.
- `sex`: `0` другое, `1` мужской, `2` женский.
- `type` (клиент): `'new' | 'potential' | 'noGroup'`.
- `online`: `true` — запись пришла через онлайн-запись.

---

### Payload: Клиент / пациент (object: "client")

```json
{
  "object": "client",
  "type": "update | create",
  "orgId": "1234",
  "orgName": "Russia",
  "product": "arnica | denta | clinica",
  "client": {
    "id": 1,
    "name": "Батюхно Никита Сергеевич",
    "firstname": "Никита",
    "lastname": "Батюхно",
    "patronymic": "Сергеевич",
    "phone": "+79995870011",
    "additionalPhone": "",
    "sex": 1,
    "birthDate": "12.05.2000",
    "comment": "Спокойный, адекватный",
    "totalArrival": "100.50",
    "type": "potential",
    "visitsCount": 1,
    "tags": ["через друзей"],
    "email": "batuhno@somemail.pro",
    "passportData": "",
    "address": "",
    "passportDataDetailed": {
      "serialDocument": "",
      "numberDocument": "",
      "dateOfIssue": "",
      "issuingAuthority": ""
    },
    "medicalClientData": {
      "documentType": "",
      "serialDocument": "",
      "numberDocument": "",
      "dateOfIssue": "",
      "issuingAuthority": ""
    }
  }
}
```

---

### Payload: Услуга (object: "service")

```json
{
  "object": "service",
  "type": "update | create",
  "orgId": "1234",
  "orgName": "Russia",
  "product": "arnica | denta | clinica",
  "service": {
    "id": 1,
    "title": "Топ услуга",
    "description": "Описание для онлайн-записи",
    "category": "стрижка",
    "durationSeconds": 3600,
    "price": {
      "currencyCode": "ru",
      "range": ["100.50", "100.50"]
    }
  }
}
```

---

### Payload: Товар (object: "service" с полем commodity)

В документе у этого payload `object: "service"`, но контейнер — `commodity`. Это особенность SQNS, при разборе хука ориентируйтесь на наличие поля `commodity` vs `service` в payload.

```json
{
  "object": "service",
  "type": "update | create",
  "orgId": "1234",
  "orgName": "Russia",
  "product": "arnica | denta | clinica",
  "commodity": {
    "id": 1,
    "title": "Топ товар",
    "description": "Описание для онлайн-записи",
    "category": "стрижка",
    "price": "100.50",
    "article": ""
  }
}
```

---

## 5. СВОДНАЯ ТАБЛИЦА ЭНДПОИНТОВ

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/v1/auth` | Получение JWT-токена |
| GET | `/api/v2/resource` | Список сотрудников для онлайн-записи |
| GET | `/api/v2/booking/service` | Список услуг для онлайн-записи |
| GET | `/api/v2/booking/service/{id}` | Услуга по id (для онлайн-записи) |
| GET | `/api/v2/resource/{id}/date` | Доступные даты у сотрудника |
| GET | `/api/v2/resource/{id}/time` | Доступные слоты у сотрудника на дату |
| POST | `/api/v2/visit` | Создание визита |
| PUT | `/api/v2/visit/{id}` | Обновление визита |
| DELETE | `/api/v2/visit/{id}` | Отмена визита |
| GET | `/api/v2/client/phone/{phone}` | Клиент по телефону |
| GET | `/api/v2/client/{id}` | Клиент по id |
| GET | `/api/v2/visit` | Выгрузка визитов за период |
| GET | `/api/v2/service` | Выгрузка услуг |
| GET | `/api/v2/client` | Выгрузка клиентов |
| GET | `/api/v2/commodity` | Выгрузка товаров |
| POST | `/api/v2/hook_settings` | Настройка вебхуков |

---

## 6. ПРИМЕЧАНИЯ ДЛЯ DENTAFLOW (denta / clinica)

- В payload вебхуков используется `medicalClientData` вместо `passportDataDetailed`.
- Поле `product` будет равно `denta` (для стоматологий) или `clinica`.
- В выгрузке `/api/v2/visit` стоит обрабатывать `services`, `commodities`, `subscriptions`, `certificates` отдельно — это разные сущности в составе одного визита.
- При первичной интеграции сначала обращайтесь в техподдержку SQNS для генерации ApiKey и привязки его к аккаунту клиники.
