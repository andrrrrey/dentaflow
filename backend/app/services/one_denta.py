"""SQNS CRM Exchange API client (1Denta / denta product).

Auth flow: POST /api/v1/auth → JWT → Bearer on all subsequent requests.
Token is cached module-level and refreshed automatically on 401.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level token cache so it survives across service instantiations
_cached_token: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OneDentaService:
    """Async client for the SQNS CRM Exchange API v2 (1Denta)."""

    def __init__(self) -> None:
        self.base_url = settings.ONE_DENTA_API_URL.rstrip("/")
        self.email = settings.ONE_DENTA_EMAIL
        self.password = settings.ONE_DENTA_PASSWORD

    # ------------------------------------------------------------------
    # Patients / Clients
    # ------------------------------------------------------------------

    async def get_patients(self, updated_since: datetime | None = None) -> list[dict]:
        if settings.APP_ENV == "development":
            return self._mock_patients()
        clients = await self._fetch_all_pages("/api/v2/client")
        return [self._map_client(c) for c in clients]

    async def get_patient_by_phone(self, phone: str) -> dict | None:
        if settings.APP_ENV == "development":
            for p in self._mock_patients():
                if p["phone"] == phone:
                    return p
            return None
        try:
            data = await self._request("GET", f"/api/v2/client/phone/{phone}")
            return self._map_client(data["client"]) if data.get("client") else None
        except httpx.HTTPStatusError:
            return None

    async def get_patient_by_id(self, external_id: str) -> dict | None:
        if settings.APP_ENV == "development":
            for p in self._mock_patients():
                if p["external_id"] == external_id:
                    return p
            return None
        try:
            data = await self._request("GET", f"/api/v2/client/{external_id}")
            return self._map_client(data["client"]) if data.get("client") else None
        except httpx.HTTPStatusError:
            logger.exception("Failed to fetch patient %s", external_id)
            return None

    # ------------------------------------------------------------------
    # Appointments / Visits
    # ------------------------------------------------------------------

    async def get_appointments(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict]:
        if settings.APP_ENV == "development":
            return self._mock_appointments()

        base_params: dict[str, Any] = {}
        if date_from:
            base_params["dateFrom"] = date_from.strftime("%Y-%m-%d")
        if date_to:
            base_params["dateTill"] = date_to.strftime("%Y-%m-%d")

        visits = await self._fetch_all_pages("/api/v2/visit", extra_params=base_params)
        return [self._map_visit(v) for v in visits if not v.get("deleted")]

    async def create_visit(
        self,
        *,
        name: str,
        phone: str,
        email: str | None = None,
        service_ids: list[str],
        resource_id: str,
        dt: str,
        comment: str = "",
    ) -> dict:
        """Create a new visit / appointment."""
        body: dict[str, Any] = {
            "visit": {
                "user": {"name": name, "phone": phone},
                "comment": comment,
                "appointment": {
                    "serviceIds": service_ids,
                    "resourceId": resource_id,
                    "datetime": dt,
                },
            }
        }
        if email:
            body["visit"]["user"]["email"] = email
        data = await self._request("POST", "/api/v2/visit", json_body=body)
        return data.get("visit", data)

    async def update_visit(
        self,
        visit_id: int | str,
        *,
        comment: str | None = None,
        dt: str | None = None,
    ) -> dict:
        """Update comment or datetime of an existing visit."""
        body: dict[str, Any] = {}
        if comment is not None:
            body["comment"] = comment
        if dt is not None:
            body["datetime"] = dt
        data = await self._request("PUT", f"/api/v2/visit/{visit_id}", json_body=body)
        return data.get("visit", data)

    async def delete_visit(self, visit_id: int | str) -> None:
        """Cancel / delete a visit."""
        await self._request("DELETE", f"/api/v2/visit/{visit_id}")

    # ------------------------------------------------------------------
    # Services & Resources (staff / doctors)
    # ------------------------------------------------------------------

    async def get_services(self) -> list[dict]:
        """Return full list of clinic services."""
        if settings.APP_ENV == "development":
            return []
        items = await self._fetch_all_pages("/api/v2/service")
        return items

    async def get_resources(self) -> list[dict]:
        """Return staff members available for online booking."""
        if settings.APP_ENV == "development":
            return []
        data = await self._request("GET", "/api/v2/resource")
        return data.get("resources", [])

    async def get_available_dates(
        self,
        resource_id: str,
        service_ids: list[str],
        date_from: str,
        date_to: str,
    ) -> list[str]:
        params: dict[str, Any] = {
            "serviceIds[]": service_ids,
            "from": date_from,
            "to": date_to,
        }
        data = await self._request("GET", f"/api/v2/resource/{resource_id}/date", params=params)
        return [d["date"] for d in data.get("availableDates", [])]

    async def get_available_slots(
        self,
        resource_id: str,
        service_ids: list[str],
        date: str,
    ) -> list[str]:
        params: dict[str, Any] = {"serviceIds[]": service_ids, "date": date}
        data = await self._request("GET", f"/api/v2/resource/{resource_id}/time", params=params)
        return [s["datetime"] for s in data.get("availableTimeSlots", [])]

    # ------------------------------------------------------------------
    # Webhooks
    # ------------------------------------------------------------------

    async def setup_webhook(self, urls: list[str]) -> None:
        """Register webhook URLs. Replaces the entire list on each call."""
        await self._request("POST", "/api/v2/hook_settings", json_body={"urls": urls})
        logger.info("Webhook URLs registered: %s", urls)

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    async def _authenticate(self) -> str:
        """POST /api/v1/auth → return JWT token."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/v1/auth",
                json={"email": self.email, "password": self.password},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            token = response.json()["token"]
            logger.info("1Denta: obtained new JWT token")
            return token

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
        _retry: bool = True,
    ) -> Any:
        global _cached_token
        if _cached_token is None:
            _cached_token = await self._authenticate()

        headers = {
            "Authorization": f"Bearer {_cached_token}",
            "Accept": "application/json",
        }
        url = f"{self.base_url}{path}"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.request(
                method, url, headers=headers, params=params, json=json_body
            )

            if response.status_code == 401 and _retry:
                logger.warning("1Denta: token expired, refreshing")
                _cached_token = await self._authenticate()
                return await self._request(
                    method, path, params=params, json_body=json_body, _retry=False
                )

            response.raise_for_status()
            if response.status_code == 204 or not response.content:
                return {}
            return response.json()

    async def _fetch_all_pages(
        self, path: str, extra_params: dict | None = None, per_page: int = 100
    ) -> list[dict]:
        """Paginate through all pages and return combined data list."""
        results: list[dict] = []
        page = 1
        while True:
            params: dict[str, Any] = {"page": page, "peerPage": per_page}
            if extra_params:
                params.update(extra_params)
            data = await self._request("GET", path, params=params)
            items = data.get("data", [])
            results.extend(items)
            meta = data.get("meta", {})
            if page >= meta.get("lastPage", 1):
                break
            page += 1
        return results

    # ------------------------------------------------------------------
    # Field mapping helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _map_client(c: dict) -> dict:
        return {
            "external_id": str(c["id"]),
            "name": c.get("name", ""),
            "phone": c.get("phone", ""),
            "email": c.get("email") or None,
            "birth_date": c.get("birthDate"),
            "last_visit_at": None,
            "total_revenue": float(c.get("totalArrival") or 0),
            "is_new_patient": c.get("type") == "new",
            "tags": c.get("tags", []),
            "visits_count": c.get("visitsCount", 0),
            "sex": c.get("sex", 0),
            "comment": c.get("comment"),
            "type": c.get("type"),
        }

    @staticmethod
    def _map_visit(v: dict) -> dict:
        attendance_map = {-1: "cancelled", 0: "unconfirmed", 1: "arrived", 2: "confirmed"}
        services = v.get("services", [])
        service_name = services[0]["name"] if services else ""
        return {
            "external_id": str(v["id"]),
            "patient_external_id": str(v.get("client", "")),
            "doctor_id": str(v.get("resourceId", "")),
            "doctor_name": "",
            "service": service_name,
            "services": services,
            "scheduled_at": v.get("datetime"),
            "status": attendance_map.get(v.get("attendance", 0), "unconfirmed"),
            "revenue": float(v.get("totalPrice") or 0),
            "comment": v.get("comment", ""),
            "online": v.get("online", False),
            "author": v.get("author", ""),
            "branch": v.get("organization", {}).get("name", ""),
        }

    # ------------------------------------------------------------------
    # Mock helpers (development mode)
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
                "visits_count": 5,
                "sex": 2,
                "comment": None,
                "type": "noGroup",
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
                "visits_count": 0,
                "sex": 1,
                "comment": None,
                "type": "new",
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
                "visits_count": 12,
                "sex": 2,
                "comment": None,
                "type": "noGroup",
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
                "visits_count": 3,
                "sex": 1,
                "comment": None,
                "type": "noGroup",
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
                "visits_count": 8,
                "sex": 2,
                "comment": None,
                "type": "noGroup",
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
                "visits_count": 20,
                "sex": 1,
                "comment": None,
                "type": "noGroup",
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
                "services": [{"id": 1, "name": "Отбеливание ZOOM", "paySum": 18000, "price": "18000.00", "discount": 0, "amount": 1}],
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=10)).isoformat(),
                "status": "confirmed",
                "revenue": 18000.00,
                "comment": "",
                "online": False,
                "author": "Администратор",
            },
            {
                "external_id": "1D-A-5002",
                "patient_external_id": "1D-P-1003",
                "doctor_name": "Сидорова М.В.",
                "doctor_id": "DOC-03",
                "service": "Установка импланта (Nobel Biocare)",
                "services": [{"id": 2, "name": "Установка импланта", "paySum": 55000, "price": "55000.00", "discount": 0, "amount": 1}],
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=11, minutes=30)).isoformat(),
                "status": "unconfirmed",
                "revenue": 55000.00,
                "comment": "",
                "online": False,
                "author": "Администратор",
            },
            {
                "external_id": "1D-A-5003",
                "patient_external_id": "1D-P-1005",
                "doctor_name": "Иванова А.С.",
                "doctor_id": "DOC-01",
                "service": "Профессиональная гигиена",
                "services": [{"id": 3, "name": "Профессиональная гигиена", "paySum": 5500, "price": "5500.00", "discount": 0, "amount": 1}],
                "branch": "Центральная клиника",
                "scheduled_at": (today + timedelta(hours=14)).isoformat(),
                "status": "confirmed",
                "revenue": 5500.00,
                "comment": "",
                "online": True,
                "author": "Онлайн-запись",
            },
        ]
