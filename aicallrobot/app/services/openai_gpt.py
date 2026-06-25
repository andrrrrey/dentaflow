"""OpenAI (ChatGPT) сервис.

Совместим по интерфейсу с прежним YandexGPTService: метод ``complete(messages, …)``
принимает сообщения в формате ``[{"role": ..., "text": ...}]`` и возвращает текст
ответа. Внутри конвертирует формат в OpenAI Chat Completions
(``{"role": ..., "content": ...}``). Ключ и модель читаются из настроек, которые
DentaFlow задаёт в рантайме (см. app/core/runtime_credentials.py).
"""

import httpx
from loguru import logger

from app.core.config import get_settings


class OpenAIGPTService:
    """Клиент OpenAI Chat Completions."""

    COMPLETION_URL = "https://api.openai.com/v1/chat/completions"

    def __init__(self):
        self.settings = get_settings()
        # Персистентный клиент: переиспользует TCP/TLS-соединения
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )

    async def complete(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Генерирует ответ ассистента.

        Args:
            messages: ``[{"role": "system"|"user"|"assistant", "text": "..."}]``
            temperature: температура (по умолчанию 0.3)
            max_tokens: лимит токенов ответа

        Returns:
            Текст ответа ассистента.
        """
        api_key = self.settings.openai_api_key
        if not api_key:
            raise RuntimeError("OpenAI API key is not configured")

        # Конвертация формата Yandex {"role","text"} → OpenAI {"role","content"}
        oai_messages = [
            {
                "role": m.get("role", "user"),
                "content": m.get("text") if m.get("text") is not None else m.get("content", ""),
            }
            for m in messages
        ]

        body: dict = {
            "model": self.settings.openai_model,
            "messages": oai_messages,
            "temperature": temperature if temperature is not None else 0.3,
        }
        if max_tokens is not None:
            body["max_tokens"] = max_tokens

        try:
            response = await self._client.post(
                self.COMPLETION_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()
            text = data["choices"][0]["message"]["content"]
            logger.debug(f"OpenAI response: {text[:100]}...")
            return text
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenAI HTTP error {e.response.status_code}: {e.response.text[:300]}")
            raise
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
            raise
