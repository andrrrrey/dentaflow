# Ubuntu 22.04 (jammy): Asterisk 18 доступен в репозитории universe и включает
# chan_pjsip + AudioSocket (res_audiosocket / app_audiosocket / chan_audiosocket),
# нужные для ИИ-обзвона. (В Debian 12 «bookworm» пакета asterisk нет — он оттуда
# удалён, поэтому базовый образ именно Ubuntu.)
FROM ubuntu:22.04

# noninteractive — чтобы установка зависимостей (tzdata и пр.) не запрашивала ввод.
ENV DEBIAN_FRONTEND=noninteractive

# curl + jq — entrypoint забирает SIP-настройки Novofon из админки DentaFlow.
# gettext-base даёт envsubst для рендера pjsip.conf/manager.conf из шаблонов.
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
