FROM debian:bookworm-slim

# Asterisk из репозитория Debian (20.x) включает chan_pjsip и AudioSocket
# (res_audiosocket / app_audiosocket), нужные для ИИ-обзвона.
# curl + jq — чтобы entrypoint забрал SIP-настройки Novofon из админки DentaFlow.
# gettext-base даёт envsubst для рендера pjsip.conf из шаблона.
RUN apt-get update && apt-get install -y --no-install-recommends \
        asterisk \
        curl \
        jq \
        gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Наши конфиги поверх дефолтных (modules.conf с autoload=yes остаётся от пакета).
COPY etc/ /etc/asterisk/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# SIP (signalling) + диапазон RTP (см. rtp.conf). При работе за NAT задайте
# EXTERNAL_IP и пробросьте эти UDP-порты.
EXPOSE 5060/udp
EXPOSE 10000-10020/udp

ENTRYPOINT ["/entrypoint.sh"]
