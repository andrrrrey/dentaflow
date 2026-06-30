#!/bin/sh
# Рендер конфигов из шаблонов. SIP-настройки Novofon берём из админки DentaFlow
# (источник истины — БД, раздел «Интеграции»), с фоллбэком на переменные окружения.
set -e

# 1) Пытаемся забрать SIP-настройки из backend (внутренний эндпоинт по общему секрету).
if [ -n "$BACKEND_URL" ] && [ -n "$INTERNAL_API_TOKEN" ]; then
    JSON=$(curl -sf -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
        "$BACKEND_URL/api/v1/ai-calling/internal/novofon-sip" || true)
    if [ -n "$JSON" ]; then
        SIP_LOGIN=${SIP_LOGIN:-$(echo "$JSON" | jq -r '.sip_login // empty')}
        SIP_PASSWORD=${SIP_PASSWORD:-$(echo "$JSON" | jq -r '.sip_password // empty')}
        SIP_SERVER=${SIP_SERVER:-$(echo "$JSON" | jq -r '.sip_server // empty')}
        CALLER_ID=${CALLER_ID:-$(echo "$JSON" | jq -r '.caller_id // empty')}
    fi
fi

EXTERNAL_IP=${EXTERNAL_IP:-}
AMI_PASSWORD=${AMI_PASSWORD:-}
export SIP_LOGIN SIP_PASSWORD SIP_SERVER CALLER_ID EXTERNAL_IP AMI_PASSWORD

if [ -z "$SIP_SERVER" ] || [ -z "$SIP_LOGIN" ]; then
    echo "[entrypoint] ВНИМАНИЕ: SIP-настройки Novofon не заданы (ни env, ни админка)."
    echo "[entrypoint] Транк не зарегистрируется. Заполните раздел «Интеграции → Novofon»."
fi
if [ -z "$AMI_PASSWORD" ]; then
    echo "[entrypoint] ВНИМАНИЕ: AMI_PASSWORD не задан — оркестратор не сможет инициировать звонки."
fi

envsubst < /etc/asterisk/pjsip.conf.template   > /etc/asterisk/pjsip.conf
envsubst < /etc/asterisk/manager.conf.template > /etc/asterisk/manager.conf
echo "[entrypoint] Конфиги отрендерены (server=$SIP_SERVER login=$SIP_LOGIN, AMI=on)."

exec asterisk -f -vvvg
