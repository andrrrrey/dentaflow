#!/bin/sh
# Рендер pjsip.conf из шаблона. SIP-настройки Novofon берём из админки DentaFlow
# (источник истины — БД, раздел «Интеграции»), с фоллбэком на переменные окружения.
set -e

TEMPLATE=/etc/asterisk/pjsip.conf.template
OUT=/etc/asterisk/pjsip.conf

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

# 2) external_media/signaling — только если задан публичный IP (работа за NAT).
EXTERNAL_IP=${EXTERNAL_IP:-}
export SIP_LOGIN SIP_PASSWORD SIP_SERVER CALLER_ID EXTERNAL_IP

if [ -z "$SIP_SERVER" ] || [ -z "$SIP_LOGIN" ]; then
    echo "[entrypoint] ВНИМАНИЕ: SIP-настройки Novofon не заданы (ни env, ни админка)."
    echo "[entrypoint] Транк не зарегистрируется. Заполните раздел «Интеграции → Novofon»."
fi

envsubst < "$TEMPLATE" > "$OUT"
echo "[entrypoint] pjsip.conf отрендерен (server=$SIP_SERVER login=$SIP_LOGIN)."

exec asterisk -f -vvvg
