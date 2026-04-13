"""AI service powered by OpenAI GPT-4o.

Provides daily insights, patient analysis, reply suggestions and
communication prioritisation.  In development mode every method returns
realistic Russian-language mock data so the dashboard can be demonstrated
without an OpenAI API key.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy-loaded openai client (avoids import-time errors when the key is empty)
_openai_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


class AIService:
    """High-level AI helpers for DentaFlow."""

    def __init__(self) -> None:
        self.model = settings.OPENAI_MODEL

    # ------------------------------------------------------------------
    # Daily insights
    # ------------------------------------------------------------------

    async def generate_daily_insights(self, kpi: dict) -> dict:
        """Generate a brief AI summary of the day's KPI."""
        if settings.APP_ENV == "development":
            return self._mock_insights()

        prompt = (
            "Ты — AI-ассистент стоматологической клиники DentaFlow. "
            "Проанализируй ключевые показатели за день и дай краткие рекомендации "
            "на русском языке.\n\n"
            f"KPI: {json.dumps(kpi, ensure_ascii=False)}"
        )

        return await self._chat(
            system="Ты — аналитик стоматологической клиники. Отвечай кратко и по делу.",
            user=prompt,
            parse_json=True,
        )

    # ------------------------------------------------------------------
    # Patient analysis
    # ------------------------------------------------------------------

    async def analyze_patient(self, patient_data: dict, history: list | None = None) -> dict:
        """Return an AI analysis of a patient including return probability."""
        if settings.APP_ENV == "development":
            return self._mock_patient_analysis()

        prompt = (
            "Проанализируй данные пациента стоматологической клиники.\n"
            "Оцени вероятность возврата (0-100), основные барьеры и "
            "рекомендуемое следующее действие.\n\n"
            f"Пациент: {json.dumps(patient_data, ensure_ascii=False, default=str)}\n"
            f"История: {json.dumps(history or [], ensure_ascii=False, default=str)}"
        )

        return await self._chat(
            system="Ты — AI-аналитик стоматологической клиники.",
            user=prompt,
            parse_json=True,
        )

    # ------------------------------------------------------------------
    # Reply suggestions
    # ------------------------------------------------------------------

    async def suggest_reply(self, context: dict) -> list[str]:
        """Generate 2-3 possible reply options for a communication."""
        if settings.APP_ENV == "development":
            return self._mock_reply_suggestions()

        prompt = (
            "Предложи 2-3 варианта ответа пациенту стоматологической клиники "
            "на основе контекста. Каждый вариант — отдельная строка.\n\n"
            f"Контекст: {json.dumps(context, ensure_ascii=False, default=str)}"
        )

        result = await self._chat(
            system="Ты — администратор стоматологической клиники.",
            user=prompt,
            parse_json=False,
        )

        # Parse line-separated replies
        text = result if isinstance(result, str) else result.get("text", "")
        lines = [line.strip().lstrip("0123456789.)-– ") for line in text.splitlines() if line.strip()]
        return lines[:3] if lines else self._mock_reply_suggestions()

    # ------------------------------------------------------------------
    # Communication prioritisation
    # ------------------------------------------------------------------

    async def prioritize_communication(self, comm_data: dict) -> dict:
        """Determine priority and tags for an incoming communication."""
        if settings.APP_ENV == "development":
            return self._mock_prioritization()

        prompt = (
            "Определи приоритет (urgent / high / normal / low) и "
            "теги для входящей коммуникации стоматологической клиники.\n"
            "Ответ — JSON с ключами priority и tags (список строк).\n\n"
            f"Данные: {json.dumps(comm_data, ensure_ascii=False, default=str)}"
        )

        return await self._chat(
            system="Ты — AI-классификатор обращений стоматологической клиники.",
            user=prompt,
            parse_json=True,
        )

    # ------------------------------------------------------------------
    # OpenAI transport
    # ------------------------------------------------------------------

    async def _chat(
        self,
        *,
        system: str,
        user: str,
        parse_json: bool = False,
    ) -> dict | str:
        client = _get_openai_client()

        try:
            response = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.4,
                max_tokens=1024,
            )
            text = response.choices[0].message.content or ""

            if parse_json:
                # Try to extract JSON from the response
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    # Attempt to find JSON block within text
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start != -1 and end > start:
                        return json.loads(text[start:end])
                    return {"text": text}

            return text

        except Exception:
            logger.exception("OpenAI API call failed")
            if parse_json:
                return {"error": "AI service unavailable"}
            return "AI service unavailable"

    # ------------------------------------------------------------------
    # Mock data
    # ------------------------------------------------------------------

    @staticmethod
    def _mock_insights() -> dict:
        return {
            "summary": (
                "Сегодня наблюдается рост входящих обращений на 15% по сравнению "
                "с прошлой неделей. Конверсия из обращения в запись составляет 68%."
            ),
            "highlights": [
                "3 пропущенных звонка остаются без ответа более 30 минут",
                "Пациент Елена Васильева (VIP) не была на приёме 60 дней — рекомендуется напоминание",
                "Запись к ортодонту заполнена на 90% на следующую неделю",
            ],
            "recommendations": [
                "Перезвонить по пропущенным звонкам в первую очередь",
                "Отправить напоминание VIP-пациентам о профосмотре",
                "Рассмотреть добавление дополнительного приёмного дня к ортодонту",
            ],
        }

    @staticmethod
    def _mock_patient_analysis() -> dict:
        return {
            "summary": (
                "Пациент с высоким потенциалом LTV. Регулярно посещает клинику, "
                "интересуется эстетической стоматологией."
            ),
            "return_probability": 72,
            "barriers": [
                "Длительный перерыв между визитами",
                "Не завершён план лечения по имплантации",
            ],
            "next_action": (
                "Позвонить и предложить бесплатную консультацию по "
                "завершению имплантации со скидкой 10%"
            ),
            "ltv_score": 78,
        }

    @staticmethod
    def _mock_reply_suggestions() -> list[str]:
        return [
            (
                "Здравствуйте! Спасибо за обращение в нашу клинику. "
                "Подскажите, какой день и время будут для вас удобны для записи?"
            ),
            (
                "Добрый день! Мы можем предложить вам консультацию "
                "у нашего специалиста. Ближайшее свободное время — завтра в 14:00."
            ),
            (
                "Здравствуйте! Будем рады помочь. Для подбора оптимального "
                "времени приёма, уточните, пожалуйста, какая услуга вас интересует?"
            ),
        ]

    @staticmethod
    def _mock_prioritization() -> dict:
        return {
            "priority": "high",
            "tags": ["горячий_лид", "первичное_обращение"],
        }
