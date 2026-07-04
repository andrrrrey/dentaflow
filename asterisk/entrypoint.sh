#!/bin/sh
# Рендер конфигов из шаблонов. SIP-настройки Novofon берём из админки DentaFlow
# (источник истины — БД, раздел «Интеграции»), с фоллбэком на переменные окружения.
set -e

SIP_ENDPOINT="/api/v1/ai-calling/internal/novofon-sip"

# 1) Тянем SIP-настройки из backend. Повторяем, пока backend не готов и не отдаст
#    их (гонка старта контейнеров + backend может быть ещё в миграциях).
if [ -z "$INTERNAL_API_TOKEN" ]; then
    echo "[entrypoint] INTERNAL_API_TOKEN пуст в контейнере — задайте его в .env и пересоздайте контейнер."
fi

if [ -n "$BACKEND_URL" ] && [ -n "$INTERNAL_API_TOKEN" ]; then
    i=1
    while [ "$i" -le 20 ]; do
        CODE=$(curl -s -o /tmp/novofon_sip.json -w "%{http_code}" \
            -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
            "$BACKEND_URL$SIP_ENDPOINT" 2>/dev/null || echo "000")
        if [ "$CODE" = "200" ]; then
            JSON=$(cat /tmp/novofon_sip.json)
            SIP_LOGIN=${SIP_LOGIN:-$(echo "$JSON" | jq -r '.sip_login // empty')}
            SIP_PASSWORD=${SIP_PASSWORD:-$(echo "$JSON" | jq -r '.sip_password // empty')}
            SIP_SERVER=${SIP_SERVER:-$(echo "$JSON" | jq -r '.sip_server // empty')}
            CALLER_ID=${CALLER_ID:-$(echo "$JSON" | jq -r '.caller_id // empty')}
            AMI_PASSWORD=${AMI_PASSWORD:-$(echo "$JSON" | jq -r '.ami_password // empty')}
            echo "[entrypoint] Настройки получены из админки (HTTP 200)."
            break
        elif [ "$CODE" = "403" ]; then
            echo "[entrypoint] backend вернул 403: INTERNAL_API_TOKEN в контейнере asterisk и в backend не совпадают. Перезапустите backend с тем же токеном из .env."
            break
        else
            echo "[entrypoint] backend недоступен/не готов (HTTP $CODE), попытка $i/20…"
            i=$((i + 1))
            sleep 2
        fi
    done
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
