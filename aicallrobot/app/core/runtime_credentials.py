"""Учётные данные, задаваемые в рантайме из DentaFlow.

Владелец вводит API-ключи в настройках интеграций DentaFlow, а бэкенд DentaFlow
присылает их сюда (POST /api/v1/runtime-credentials). Значения мутируют
закешированный singleton настроек, поэтому TTS/ASR (Yandex SpeechKit) и
классификатор (OpenAI) подхватывают их при следующем вызове — без хранения
ключей в .env этого сервиса.
"""

from app.core.config import get_settings


def set_runtime_credentials(
    yandex_api_key: str | None = None,
    yandex_folder_id: str | None = None,
    openai_api_key: str | None = None,
    openai_model: str | None = None,
):
    """Обновляет учётные данные в закешированных настройках. Возвращает их."""
    settings = get_settings()
    if yandex_api_key:
        settings.yandex_api_key = yandex_api_key
    if yandex_folder_id:
        settings.yandex_folder_id = yandex_folder_id
    if openai_api_key:
        settings.openai_api_key = openai_api_key
    if openai_model:
        settings.openai_model = openai_model
    return settings
