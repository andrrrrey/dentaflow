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

# 2) CallerID → только цифры (для From/CallerID; иначе Novofon сбрасывает cause 16).
CALLER_ID_DIGITS=$(echo "$CALLER_ID" | tr -cd '0-9')

# 3) Публичный IP для NAT (SDP/Contact должны нести внешний IP, а не адрес контейнера).
if [ -z "$EXTERNAL_IP" ]; then
    EXTERNAL_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || true)
fi
if [ -n "$EXTERNAL_IP" ]; then
    NAT_CONFIG="external_media_address=$EXTERNAL_IP
external_signaling_address=$EXTERNAL_IP
local_net=172.16.0.0/12
local_net=10.0.0.0/8
local_net=192.168.0.0/16"
    echo "[entrypoint] NAT: внешний IP = $EXTERNAL_IP"
else
    NAT_CONFIG=""
    echo "[entrypoint] ВНИМАНИЕ: EXTERNAL_IP не задан и не определился — звук может не пойти (NAT). Задайте EXTERNAL_IP в .env."
fi

AMI_PASSWORD=${AMI_PASSWORD:-}
export SIP_LOGIN SIP_PASSWORD SIP_SERVER CALLER_ID CALLER_ID_DIGITS EXTERNAL_IP NAT_CONFIG AMI_PASSWORD

if [ -z "$SIP_SERVER" ] || [ -z "$SIP_LOGIN" ]; then
    echo "[entrypoint] ВНИМАНИЕ: SIP-настройки Novofon не заданы (ни env, ни админка)."
    echo "[entrypoint] Транк не зарегистрируется. Заполните раздел «Интеграции → Novofon»."
fi
if [ -z "$CALLER_ID_DIGITS" ]; then
    echo "[entrypoint] ВНИМАНИЕ: CallerID (исходящий номер) пуст — Novofon отклонит исходящие. Заполните «Исходящий номер» в админке."
fi
if [ -z "$AMI_PASSWORD" ]; then
    echo "[entrypoint] ВНИМАНИЕ: AMI_PASSWORD не задан — оркестратор не сможет инициировать звонки."
fi

envsubst < /etc/asterisk/pjsip.conf.template   > /etc/asterisk/pjsip.conf
envsubst < /etc/asterisk/manager.conf.template > /etc/asterisk/manager.conf
echo "[entrypoint] Конфиги отрендерены (server=$SIP_SERVER login=$SIP_LOGIN callerid=$CALLER_ID_DIGITS ext_ip=$EXTERNAL_IP, AMI=on)."

exec asterisk -f -vvvg
