"""1Denta CRM API client.

Provides patient and appointment synchronisation with the 1Denta dental
practice-management system.  In development mode every method returns
realistic mock data so the dashboard can be demonstrated without a live
CRM connection.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OneDentaService:
    """Async client for the 1Denta REST API."""

    def __init__(self) -> None:
        self.base_url = settings.ONE_DENTA_API_URL.rstrip("/") if settings.ONE_DENTA_API_URL else ""
        self.api_key = settings.ONE_DENTA_API_KEY

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_patients(self, updated_since: datetime | None = None) -> list[dict]:
        """Return patients updated since *updated_since*.

        In development mode returns mock data; in production queries the
        1Denta API.
        """
        if settings.APP_ENV == "development":
            return self._mock_patients()

        params: dict[str, str] = {}
        if updated_since is not None:
            params["updated_since"] = updated_since.isoformat()

        return await self._request("GET", "/patients", params=params)

    async def get_appointments(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict]:
        """Return appointments in the given date range."""
        if settings.APP_ENV == "development":
            return self._mock_appointments()

        params: dict[str, str] = {}
        if date_from is not None:
            params["date_from"] = date_from.isoformat()
        if date_to is not None:
            params["date_to"] = date_to.isoformat()

        return await self._request("GET", "/appointments", params=params)

    async def get_patient_by_phone(self, phone: str) -> dict | None:
        """Look up a single patient by phone number."""
        if settings.APP_ENV == "development":
            for p in self._mock_patients():
                if p["phone"] == phone:
                    return p
            return None

        results = await self._request("GET", "/patients", params={"phone": phone})
        return results[0] if results else None

    async def get_patient_by_id(self, external_id: str) -> dict | None:
        """Look up a single patient by their 1Denta ID."""
        if settings.APP_ENV == "development":
            for p in self._mock_patients():
                if p["external_id"] == external_id:
                    return p
            return None

        try:
            return await self._request("GET", f"/patients/{external_id}")
        except Exception:
            logger.exception("Failed to fetch patient %s", external_id)
            return None

    # ------------------------------------------------------------------
    # HTTP transport
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> list | dict:
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json_body,
            )
            response.raise_for_status()
            return response.json()

    # ------------------------------------------------------------------
    # Mock helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _mock_patients() -> list[dict]:
        now = _utcnow()
        return [
            {
                "external_id": "1D-P-1001",
                "name": "Мария Соколова",
                "phone": "+79991234567",
                "email": "sokolova@mail.ru",
                "birth_date": "1990-03-15",
                "last_visit_at": (now - timedelta(days=14)).isoformat(),
                "total_revenue": 85000.00,
                "is_new_patient": False,
                "tags": ["отбеливание", "постоянный"],
            },
            {
                "external_id": "1D-P-1002",
                "name": "Дмитрий Козлов",
                "phone": "+79161112233",
                "email": "kozlov.d@yandex.ru",
                "birth_date": "1985-07-22",
                "last_visit_at": None,
                "total_revenue": 0,
                "is_new_patient": True,
                "tags": ["ортодонтия", "детский"],
            },
            {
                "external_id": "1D-P-1003",
                "name": "Елена Васильева",
                "phone": "+79037778899",
                "email": None,
                "birth_date": "1978-11-03",
                "last_visit_at": (now - timedelta(days=60)).isoformat(),
                "total_revenue": 142500.00,
                "is_new_patient": False,
                "tags": ["имплантация", "VIP"],
            },
            {
                "external_id": "1D-P-1004",
                "name": "Андрей Новиков",
                "phone": "+79265554433",
                "email": "novikov.a@gmail.com",
                "birth_date": "1995-01-30",
                "last_visit_at": (now - timedelta(days=7)).isoformat(),
                "total_revenue": 23000.00,
                "is_new_patient": False,
                "tags": ["имплантация"],
            },
            {
                "external_id": "1D-P-1005",
                "name": "Ирина Петрова",
                "phone": "+79109876543",
                "email": "petrova.irina@mail.ru",
                "birth_date": "1982-09-18",
                "last_visit_at": (now - timedelta(days=180)).isoformat(),
                "total_revenue": 67000.00,
                "is_new_patient": False,
                "tags": ["профосмотр", "повторный"],
            },
            {
                "external_id": "1D-P-1006",
                "name": "Сергей Морозов",
                "phone": "+79551239876",
                "email": None,
                "birth_date": "1970-12-05",
                "last_visit_at": (now - timedelta(days=3)).isoformat(),
                "total_revenue": 195000.00,
                "is_new_patient": False,
                "tags": ["хирургия", "VIP"],
            },
        ]

    @staticmethod
    def _mock_appointments() -> list[dict]:
        now = _utcnow()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return [
            {
                "external_id": "1D-A-5001",
                "patient_external_id": "1D-P-1001",
                "doctor_name": "Иванова А.С.",
                "doctor_id": "DOC-01",
                "service": "Отбеливание ZOOM",
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=10)).isoformat(),
                "duration_min": 60,
                "status": "confirmed",
                "revenue": 18000.00,
            },
            {
                "external_id": "1D-A-5002",
                "patient_external_id": "1D-P-1003",
                "doctor_name": "Сидорова М.В.",
                "doctor_id": "DOC-03",
                "service": "Установка импланта (Nobel Biocare)",
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=11, minutes=30)).isoformat(),
                "duration_min": 90,
                "status": "scheduled",
                "revenue": 55000.00,
            },
            {
                "external_id": "1D-A-5003",
                "patient_external_id": "1D-P-1005",
                "doctor_name": "Иванова А.С.",
                "doctor_id": "DOC-01",
                "service": "Профессиональная гигиена",
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=14)).isoformat(),
                "duration_min": 45,
                "status": "confirmed",
                "revenue": 5500.00,
            },
            {
                "external_id": "1D-A-5004",
                "patient_external_id": "1D-P-1006",
                "doctor_name": "Сидорова М.В.",
                "doctor_id": "DOC-03",
                "service": "Удаление зуба мудрости",
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=16)).isoformat(),
                "duration_min": 60,
                "status": "scheduled",
                "revenue": 12000.00,
            },
            {
                "external_id": "1D-A-5005",
                "patient_external_id": "1D-P-1004",
                "doctor_name": "Козлов Д.И.",
                "doctor_id": "DOC-02",
                "service": "Консультация ортодонта",
                "branch": "Филиал на Тверской",
                "scheduled_at": (today + timedelta(days=1, hours=9)).isoformat(),
                "duration_min": 30,
                "status": "scheduled",
                "revenue": 2000.00,
            },
        ]
