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

        # Fallback: template-based insights from real KPI (no OpenAI needed)
        if not settings.OPENAI_API_KEY:
            return self._template_insights(kpi)

        prompt = (
            "Ты — AI-ассистент стоматологической клиники DentaFlow. "
            "Проанализируй ключевые показатели за период и дай 2-3 конкретных совета "
            "на русском языке. Верни JSON с ключами: summary (строка), highlights (список строк), recommendations (список строк).\n\n"
            f"KPI: {json.dumps(kpi, ensure_ascii=False)}"
        )

        result = await self._chat(
            system="Ты — аналитик стоматологической клиники. Отвечай кратко и по делу на русском.",
            user=prompt,
            parse_json=True,
        )

        # If OpenAI failed, fall back to template
        if "error" in result:
            return self._template_insights(kpi)

        return result

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
    # Script analysis
    # ------------------------------------------------------------------

    async def analyze_script(self, script_content: str) -> dict:
        """Analyze a call script for quality, completeness, and weaknesses."""
        if settings.APP_ENV == "development":
            return self._mock_script_analysis()

        prompt = (
            "Проанализируй скрипт звонка для администратора стоматологической клиники.\n"
            "Оцени:\n"
            "1. Общее качество (0-100)\n"
            "2. Полноту (все ли этапы разговора покрыты)\n"
            "3. Сильные стороны\n"
            "4. Слабые места и рекомендации по улучшению\n\n"
            "Верни JSON с ключами: score, completeness, strengths (список), "
            "weaknesses (список), recommendations (список).\n\n"
            f"Скрипт:\n{script_content}"
        )

        return await self._chat(
            system="Ты — эксперт по продажам и телефонным переговорам в стоматологии.",
            user=prompt,
            parse_json=True,
        )

    async def compare_call_with_script(self, transcript: str, script_content: str) -> dict:
        """Compare a call transcript with a script to determine compliance."""
        if settings.APP_ENV == "development":
            return self._mock_call_comparison()

        prompt = (
            "Сравни расшифровку звонка со скриптом для администратора "
            "стоматологической клиники.\n"
            "Определи:\n"
            "1. Общее соответствие скрипту (0-100%)\n"
            "2. Какие этапы скрипта были выполнены\n"
            "3. Какие этапы пропущены\n"
            "4. Отклонения от скрипта\n"
            "5. Рекомендации по улучшению\n\n"
            "Верни JSON: compliance_pct, completed_steps (список), "
            "missed_steps (список), deviations (список), recommendations (список).\n\n"
            f"СКРИПТ:\n{script_content}\n\n"
            f"РАСШИФРОВКА ЗВОНКА:\n{transcript}"
        )

        return await self._chat(
            system="Ты — эксперт по контролю качества звонков в стоматологии.",
            user=prompt,
            parse_json=True,
        )

    # ------------------------------------------------------------------
    # Reports advice
    # ------------------------------------------------------------------

    async def generate_reports_advice(self, db=None) -> dict:
        """Generate AI advice based on clinic reports data."""
        if settings.APP_ENV == "development":
            return self._mock_reports_advice()

        kpi_summary = {}
        if db is not None:
            try:
                from app.services.dashboard_service import get_dashboard_overview
                from datetime import date, timedelta
                date_to = date.today()
                date_from = date_to - timedelta(days=30)
                overview = await get_dashboard_overview(db, date_from=str(date_from), date_to=str(date_to))
                kpi_summary = {
                    "revenue": overview.revenue,
                    "appointments": overview.appointments,
                    "kpi": overview.kpi.__dict__ if hasattr(overview.kpi, "__dict__") else {},
                }
            except Exception:
                pass

        prompt = (
            "Ты — AI-аналитик стоматологической клиники DentaFlow. "
            "Проанализируй показатели клиники и дай 3-5 конкретных совета по улучшению бизнеса. "
            "Каждый совет должен быть практичным и actionable.\n\n"
            f"Данные за последние 30 дней: {json.dumps(kpi_summary, ensure_ascii=False, default=str)}\n\n"
            "Верни JSON с ключами: summary (краткий вывод), advice (список советов строками), priority_action (главное действие)."
        )

        return await self._chat(
            system="Ты — бизнес-аналитик стоматологической клиники. Давай конкретные, измеримые советы.",
            user=prompt,
            parse_json=True,
        )

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
    # Template insights (no AI needed — built from real KPI numbers)
    # ------------------------------------------------------------------

    @staticmethod
    def _template_insights(kpi: dict) -> dict:
        appointments = kpi.get("appointments", 0)
        confirmed = kpi.get("confirmed", 0)
        no_shows = kpi.get("no_shows", 0)
        revenue = kpi.get("revenue", 0)
        new_leads = kpi.get("new_leads", 0)
        conversion = kpi.get("conversion_rate", 0)
        period_label = {"day": "сегодня", "week": "эту неделю", "month": "этот месяц"}.get(
            kpi.get("period", "week"), "выбранный период"
        )

        highlights = []
        recommendations = []

        if appointments > 0:
            conf_pct = round(confirmed / appointments * 100) if appointments else 0
            highlights.append(f"Записей за {period_label}: {appointments}, подтверждено {confirmed} ({conf_pct}%)")

        if no_shows > 0:
            highlights.append(f"Неявки: {no_shows} — рекомендуется напомнить пациентам перед визитом")
            recommendations.append("Настройте автоматические напоминания за 24 часа до приёма")

        if revenue > 0:
            rev_str = f"{revenue:,.0f}".replace(",", " ")
            highlights.append(f"Выручка за {period_label}: {rev_str} ₽")

        if new_leads > 0:
            highlights.append(f"Новых пациентов: {new_leads}")

        if conversion > 0:
            if conversion < 30:
                recommendations.append(f"Конверсия {conversion}% — ниже нормы. Проверьте качество обработки входящих заявок")
            elif conversion > 60:
                recommendations.append(f"Конверсия {conversion}% — хороший результат. Масштабируйте успешные каналы")

        if not highlights:
            highlights.append(f"Данные за {period_label} загружены. Подключите OpenAI для ИИ-аналитики")

        if not recommendations:
            recommendations.append("Для получения персонализированных советов настройте OpenAI API в разделе Настройки")

        summary = " ".join(highlights[:2])

        return {"summary": summary, "highlights": highlights[2:], "recommendations": recommendations}

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
    def _mock_reports_advice() -> dict:
        return {
            "summary": "За последние 30 дней клиника показывает стабильную динамику. Выручка на уровне плана, однако есть точки роста в повторных визитах и конверсии новых пациентов.",
            "advice": [
                "Запустить акцию «Приведи друга» — конверсия рефералов в 2× выше холодного трафика",
                "Связаться с пациентами, не посещавшими клинику более 3 месяцев — высокий потенциал реактивации",
                "Увеличить долю онлайн-записи: снижает нагрузку на администраторов на 30%",
                "Ввести напоминания за 24 часа до приёма — сокращает неявки на 40%",
                "Проанализировать загрузку врачей в слабые часы (12-14:00) и предложить скидку в это время",
            ],
            "priority_action": "Реактивировать пациентов с последним визитом 60-90 дней назад: позвонить и предложить профгигиену со скидкой 15%",
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

    @staticmethod
    def _mock_script_analysis() -> dict:
        return {
            "score": 78,
            "completeness": 85,
            "strengths": [
                "Хорошее приветствие и представление клиники",
                "Корректная работа с возражениями по цене",
                "Чёткое завершение разговора с подведением итогов",
            ],
            "weaknesses": [
                "Нет уточнения удобного времени для перезвона",
                "Отсутствует предложение альтернативных услуг",
                "Не предусмотрена работа с возражением «я подумаю»",
            ],
            "recommendations": [
                "Добавить блок уточнения предпочтительного времени связи",
                "Включить cross-sell предложения (гигиена, отбеливание)",
                "Добавить технику работы с отложенным решением",
            ],
        }

    @staticmethod
    def _mock_call_comparison() -> dict:
        return {
            "compliance_pct": 72,
            "completed_steps": [
                "Приветствие и представление",
                "Выявление потребности",
                "Презентация услуги",
                "Завершение разговора",
            ],
            "missed_steps": [
                "Уточнение удобного времени",
                "Работа с возражениями",
                "Предложение записи на приём",
            ],
            "deviations": [
                "Администратор перебивал пациента",
                "Не использована техника активного слушания",
            ],
            "recommendations": [
                "Дать пациенту высказаться полностью перед ответом",
                "Использовать уточняющие вопросы для выявления потребностей",
                "Обязательно предлагать запись на конкретную дату",
            ],
        }
