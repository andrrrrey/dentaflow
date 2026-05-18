"""SQNS CRM Exchange API client (1Denta / denta product).

Auth flow: POST /api/v1/auth → JWT → Bearer on all subsequent requests.
Token is cached module-level and refreshed automatically on 401.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level caches (survive across service instantiations within one process)
_cached_token: str | None = None
_auth_locked_until: float = 0.0  # epoch seconds; don't retry auth before this time
_resources_cache: dict = {"data": [], "ts": None}  # 10-min in-process cache


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OneDentaService:
    """Async client for the SQNS CRM Exchange API v2 (1Denta)."""

    def __init__(
        self,
        base_url: str | None = None,
        email: str | None = None,
        password: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ONE_DENTA_API_URL).rstrip("/")
        self.email = email or settings.ONE_DENTA_EMAIL
        self.password = password or settings.ONE_DENTA_PASSWORD

    @classmethod
    async def from_db(cls, db: "AsyncSession") -> "OneDentaService":
        """Create service with credentials loaded from DB (falls back to env vars)."""
        from sqlalchemy import select
        from app.models.integration_setting import IntegrationSetting

        stmt = select(IntegrationSetting).where(
            IntegrationSetting.key.in_(
                ["one_denta_api_url", "one_denta_email", "one_denta_password"]
            )
        )
        result = await db.execute(stmt)
        rows = {row.key: row.value for row in result.scalars().all()}

        return cls(
            base_url=rows.get("one_denta_api_url") or settings.ONE_DENTA_API_URL,
            email=rows.get("one_denta_email") or settings.ONE_DENTA_EMAIL,
            password=rows.get("one_denta_password") or settings.ONE_DENTA_PASSWORD,
        )

    @classmethod
    async def from_db_session_factory(cls) -> "OneDentaService":
        """For use in Celery tasks — opens its own DB session."""
        from app.database import async_session_factory

        async with async_session_factory() as session:
            return await cls.from_db(session)

    # ------------------------------------------------------------------
    # Patients / Clients
    # ------------------------------------------------------------------

    def _no_credentials(self) -> bool:
        return not self.email or not self.password

    async def get_patients(self, updated_since: datetime | None = None) -> list[dict]:
        if self._no_credentials():
            return self._mock_patients()
        clients = await self._fetch_all_pages("/api/v2/client")
        return [self._map_client(c) for c in clients]

    async def get_patient_by_phone(self, phone: str) -> dict | None:
        if self._no_credentials():
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
        if self._no_credentials():
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

    async def create_client(
        self,
        *,
        name: str,
        firstname: str | None = None,
        lastname: str | None = None,
        patronymic: str | None = None,
        phone: str | None = None,
        additional_phone: str | None = None,
        email: str | None = None,
        birth_date: str | None = None,
        sex: int = 0,
        comment: str = "",
        tags: list[str] | None = None,
        snils: str | None = None,
        inn: str | None = None,
        oms: str | None = None,
        oms_issue_date: str | None = None,
        oms_org_code: str | None = None,
        citizenship: str | None = None,
        address: str | None = None,
        passport_serial: str | None = None,
        passport_number: str | None = None,
        passport_issue_date: str | None = None,
        passport_issued_by: str | None = None,
        passport_department_code: str | None = None,
    ) -> dict:
        """Create a new client in 1Denta. Returns the created client dict."""
        client_body: dict[str, Any] = {
            "name": name,
            "phone": phone or "",
            "sex": sex,
            "comment": comment,
            "tags": tags or [],
        }
        if firstname:
            client_body["firstname"] = firstname
        if lastname:
            client_body["lastname"] = lastname
        if patronymic:
            client_body["patronymic"] = patronymic
        if additional_phone:
            client_body["additionalPhone"] = additional_phone
        if email:
            client_body["email"] = email
        if birth_date:
            client_body["birthDate"] = birth_date
        if snils:
            client_body["snils"] = snils
        if inn:
            client_body["inn"] = inn
        if oms:
            client_body["oms"] = oms
        if oms_issue_date:
            client_body["omsIssueDate"] = oms_issue_date
        if oms_org_code:
            client_body["omsOrgCode"] = oms_org_code
        if citizenship:
            client_body["citizenship"] = citizenship
        if address:
            client_body["address"] = address
        if any([passport_serial, passport_number, passport_issued_by]):
            client_body["passportDataDetailed"] = {
                "serialDocument": passport_serial or "",
                "numberDocument": passport_number or "",
                "dateOfIssue": passport_issue_date or "",
                "issuingAuthority": passport_issued_by or "",
                "departmentCode": passport_department_code or "",
            }
        data = await self._request("POST", "/api/v2/client", json_body={"client": client_body})
        return data.get("client", data)

    # ------------------------------------------------------------------
    # Appointments / Visits
    # ------------------------------------------------------------------

    async def get_appointments(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict]:
        if self._no_credentials():
            return self._mock_appointments()

        base_params: dict[str, Any] = {}
        if date_from:
            base_params["dateFrom"] = date_from.strftime("%Y-%m-%d")
        if date_to:
            base_params["dateTill"] = date_to.strftime("%Y-%m-%d")

        visits = await self._fetch_all_pages("/api/v2/visit", extra_params=base_params)

        # Build resource_id → name lookup.
        # NOTE: SQNS Exchange API v2 only exposes staff with online-booking enabled via
        # /api/v2/resource. There is no endpoint for all clinic staff.
        # Unknown IDs fall back to "Врач #N" placeholders; admin can rename them manually
        # in DentaFlow → Справочники → Врачи / Ресурсы.
        resource_map: dict[str, str] = {}
        try:
            resources = await self.get_resources()
            for r in resources:
                rid = str(r.get("id", ""))
                rname = r.get("title") or r.get("name") or ""
                if rid and rname:
                    resource_map[rid] = rname
            logger.info("1Denta: loaded %d resources for doctor-name mapping", len(resource_map))
        except Exception:
            logger.exception("1Denta: failed to load resource map — doctor names will be empty")

        # Build service_id → durationSeconds lookup.
        # Visit data from /api/v2/visit does NOT embed durationSeconds on service items;
        # we must look it up from the service catalog.
        service_duration_map: dict[str, int] = {}
        try:
            raw_services = await self._fetch_all_pages("/api/v2/service")
            for s in raw_services:
                sid = str(s.get("id", ""))
                dur = s.get("durationSeconds")
                if sid and dur:
                    service_duration_map[sid] = int(dur)
            logger.info("1Denta: loaded %d service durations", len(service_duration_map))
        except Exception:
            logger.exception("1Denta: failed to load service durations — visit durations may be wrong")

        # For unknown resource IDs use a numeric placeholder.
        for v in visits:
            resource_val = v.get("resourceId")
            if resource_val is None:
                continue
            rid_str = str(resource_val)
            if rid_str not in resource_map:
                resource_map[rid_str] = f"Врач #{rid_str}"
                logger.info("1Denta: resource %s unresolvable — using placeholder", rid_str)

        mapped = [self._map_visit(v, resource_map, service_duration_map) for v in visits if not v.get("deleted")]
        self._infer_durations_from_schedule(mapped)
        return mapped

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
        if self._no_credentials():
            raise RuntimeError("1Denta credentials not configured")
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

    # Status string → 1Denta attendance int
    _ATTENDANCE_MAP: dict[str, int] = {
        "unconfirmed": 0,
        "confirmed": 2,
        "arrived": 1,
        "completed": 1,
        "cancelled": -1,
        "no_show": -1,
    }

    async def update_visit(
        self,
        visit_id: int | str,
        *,
        comment: str | None = None,
        dt: str | None = None,
        attendance: int | None = None,
    ) -> dict:
        """Update comment, datetime, or attendance of an existing visit."""
        body: dict[str, Any] = {}
        if comment is not None:
            body["comment"] = comment
        if dt is not None:
            body["datetime"] = dt
        if attendance is not None:
            body["attendance"] = attendance
        data = await self._request("PUT", f"/api/v2/visit/{visit_id}", json_body=body)
        return data.get("visit", data)

    async def get_discounts(self) -> list[dict]:
        """Return clinic discounts / loyalty items from 1Denta."""
        if self._no_credentials():
            return []
        for path in ("/api/v2/discount", "/api/v2/loyalty", "/api/v2/card"):
            try:
                items = await self._fetch_all_pages(path)
                if items is not None:
                    return items
            except Exception:
                continue
        return []

    async def get_certificates(self) -> list[dict]:
        """Return gift certificates from 1Denta."""
        if self._no_credentials():
            return []
        for path in ("/api/v2/gift_certificate", "/api/v2/certificate", "/api/v2/abonement"):
            try:
                items = await self._fetch_all_pages(path)
                if items is not None:
                    return items
            except Exception:
                continue
        return []

    async def delete_visit(self, visit_id: int | str) -> None:
        """Cancel / delete a visit."""
        await self._request("DELETE", f"/api/v2/visit/{visit_id}")

    # ------------------------------------------------------------------
    # Services & Resources (staff / doctors)
    # ------------------------------------------------------------------

    async def get_services(self) -> list[dict]:
        """Return full list of clinic services."""
        if self._no_credentials():
            return []
        items = await self._fetch_all_pages("/api/v2/service")
        return items

    async def get_resources(self) -> list[dict]:
        """Return staff members available for online booking. Cached in-process for 10 min."""
        import time
        if _resources_cache["ts"] and time.time() - _resources_cache["ts"] < 600:
            return _resources_cache["data"]
        if self._no_credentials():
            return []
        data = await self._request("GET", "/api/v2/resource", params={"page": 1, "peerPage": 200})
        resources = data.get("resources", []) or data.get("data", [])
        logger.info(
            "1Denta: /api/v2/resource page 1 → %d resources, response keys=%s",
            len(resources),
            list(data.keys()),
        )
        # Handle pagination if the API returns meta (some versions paginate)
        meta = data.get("meta", {})
        if meta:
            logger.info("1Denta: resource pagination meta=%s", meta)
            last_page = meta.get("lastPage", 1)
            for page in range(2, last_page + 1):
                page_data = await self._request(
                    "GET", "/api/v2/resource", params={"page": page, "peerPage": 200}
                )
                page_items = page_data.get("resources", []) or page_data.get("data", [])
                logger.info("1Denta: /api/v2/resource page %d → %d resources", page, len(page_items))
                resources.extend(page_items)
        _resources_cache["data"] = resources
        _resources_cache["ts"] = time.time()
        return resources

    async def get_commodities(self) -> list[dict]:
        """Return commodities/products list."""
        if self._no_credentials():
            return []
        items = await self._fetch_all_pages("/api/v2/commodity")
        return items

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
        global _auth_locked_until
        import time
        if time.time() < _auth_locked_until:
            wait = int(_auth_locked_until - time.time())
            raise RuntimeError(f"1Denta auth locked for {wait}s (account temporarily blocked by 1Denta)")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/v1/auth",
                json={"email": self.email, "password": self.password},
                headers={"Content-Type": "application/json"},
            )
            if response.status_code == 423:
                _auth_locked_until = time.time() + 1800  # don't retry for 30 min
                logger.error("1Denta: account locked (423) — will not retry auth for 30 min")
                response.raise_for_status()
            response.raise_for_status()
            token = response.json()["token"]
            _auth_locked_until = 0.0
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
            # SQNS docs use "peerPage" (not "perPage") as the page-size parameter.
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
        visits_count = int(c.get("visitsCount") or 0)
        total_revenue = float(c.get("totalArrival") or 0)
        average_check = round(total_revenue / visits_count, 2) if visits_count > 0 else None
        medical_card = (
            c.get("medCard")
            or c.get("medicalCard")
            or c.get("medCardNumber")
            or c.get("med_card")
        )
        balance = float(c.get("balance") or 0)
        deposit = float(c.get("deposit") or 0)
        discount = c.get("discount") or c.get("discountPercent") or 0

        return {
            "external_id": str(c["id"]),
            "name": c.get("name", ""),
            "phone": c.get("phone", ""),
            "email": c.get("email") or None,
            "birth_date": c.get("birthDate"),
            "last_visit_at": None,
            "total_revenue": total_revenue,
            "is_new_patient": c.get("type") == "new",
            "tags": c.get("tags", []),
            "visits_count": visits_count,
            "sex": c.get("sex", 0),
            "comment": c.get("comment"),
            "type": c.get("type"),
            "average_check": average_check,
            "medical_card": medical_card,
            "balance": balance,
            "deposit": deposit,
            "discount": discount,
        }

    @staticmethod
    def _infer_durations_from_schedule(visits: list[dict], max_gap_min: int = 180) -> None:
        """Fill in duration_min for visits where the API returned None.

        1Denta does not expose appointment duration in the visit response.
        For back-to-back appointments the duration equals the gap to the next
        appointment for the same doctor on the same day.  Gaps larger than
        max_gap_min (default 3 h) are treated as lunch breaks / free time and
        ignored so we don't inflate durations with idle time.
        """
        from collections import defaultdict
        from datetime import datetime as _dt

        # Group visits that still need a duration by (doctor_id, date)
        groups: dict[tuple, list[dict]] = defaultdict(list)
        for v in visits:
            if v.get("duration_min") is not None:
                continue
            sched = v.get("scheduled_at")
            doc = v.get("doctor_id")
            if sched and doc:
                try:
                    day = _dt.fromisoformat(sched).date().isoformat()
                    groups[(doc, day)].append(v)
                except Exception:
                    pass

        for group in groups.values():
            group.sort(key=lambda x: x.get("scheduled_at", ""))
            for i, vm in enumerate(group):
                if i + 1 >= len(group):
                    break
                try:
                    curr = _dt.fromisoformat(vm["scheduled_at"])
                    nxt = _dt.fromisoformat(group[i + 1]["scheduled_at"])
                    diff = int((nxt - curr).total_seconds() // 60)
                    if 0 < diff <= max_gap_min:
                        vm["duration_min"] = diff
                except Exception:
                    pass

    @staticmethod
    def _map_visit(
        v: dict,
        resource_map: dict[str, str] | None = None,
        service_duration_map: dict[str, int] | None = None,
    ) -> dict:
        attendance_map = {-1: "cancelled", 0: "unconfirmed", 1: "arrived", 2: "confirmed"}
        services = v.get("services", [])
        service_name = services[0]["name"] if services else ""
        client_val = v.get("client")
        resource_val = v.get("resourceId")
        resource_obj = v.get("resource") or {}
        # 1denta uses "title" for resource/doctor name, "name" as fallback
        doctor_name_val = (
            resource_obj.get("title") or resource_obj.get("name")
            or v.get("resourceName")
            or (resource_map.get(str(resource_val)) if resource_map and resource_val is not None else None)
            or ""
        )
        total_discount = sum(float(s.get("discount") or 0) for s in services)
        total_pay_sum = sum(float(s.get("paySum") or 0) for s in services)
        # Duration: 1Denta API does not return timeEnd or any duration field.
        # Try service catalog lookup (only works for ~17 online-booking services).
        # Return None when duration cannot be determined so the sync task
        # preserves whatever value is already stored in the database.
        duration_min: int | None = None
        time_start = v.get("datetime")
        time_end = v.get("timeEnd") or v.get("endAt") or v.get("endDatetime")
        if time_start and time_end:
            try:
                from datetime import datetime as _dt, time as _time
                start_dt = _dt.fromisoformat(time_start)
                try:
                    end_dt = _dt.fromisoformat(time_end)
                except ValueError:
                    # timeEnd may be a time-only string e.g. "11:00:00"
                    end_dt = _dt.combine(start_dt.date(), _time.fromisoformat(time_end))
                computed = int((end_dt - start_dt).total_seconds() // 60)
                if computed > 0:
                    duration_min = computed
            except Exception:
                pass
        if duration_min is None:
            # Catalog lookup (only services configured for online booking have durationSeconds)
            if service_duration_map:
                duration_sec = sum(
                    service_duration_map.get(str(s.get("id", "")), int(s.get("durationSeconds") or 0))
                    for s in services
                )
            else:
                duration_sec = sum(int(s.get("durationSeconds") or 0) for s in services)
            if duration_sec:
                duration_min = duration_sec // 60
            else:
                # Check if the visit itself carries a duration hint
                raw = int(v.get("duration") or v.get("durationMin") or 0)
                duration_min = raw if raw > 0 else None
        return {
            "external_id": str(v["id"]),
            "patient_external_id": str(client_val) if client_val is not None else None,
            "doctor_id": str(resource_val) if resource_val is not None else "",
            "doctor_name": doctor_name_val,
            "service": service_name,
            "services": services,
            "scheduled_at": v.get("datetime"),
            "duration_min": duration_min,
            "status": attendance_map.get(v.get("attendance", 0), "unconfirmed"),
            "revenue": float(v.get("totalPrice") or 0),
            "discount": total_discount if total_discount > 0 else None,
            "payment_amount": total_pay_sum if total_pay_sum > 0 else None,
            "services_data": services if services else None,
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
