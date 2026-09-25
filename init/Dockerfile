FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    git gcc g++ make cmake automake autoconf libtool pkg-config gengetopt \
    ca-certificates wget \
    libjansson-dev libssl-dev libglib2.0-dev libopus-dev libogg-dev \
    libcurl4-openssl-dev libconfig-dev \
    libnice-dev libsrtp2-dev libwebsockets-dev libmicrohttpd-dev \
    libusrsctp-dev \
    libavutil-dev libavcodec-dev libavformat-dev \
    && rm -rf /var/lib/apt/lists/*

RUN cd /tmp && \
    git clone --depth 1 https://gitee.com/sazima1/janus-gateway.git && \
    cd janus-gateway && \
    sh autogen.sh && \
    ./configure --prefix=/opt/janus \
        --enable-websockets \
        --enable-rest \
        --enable-post-processing \
        --enable-plugin-videoroom \
        --enable-plugin-textroom \
        --enable-plugin-recordplay \
        --enable-plugin-echotest \
        --enable-plugin-streaming \
        --disable-rabbitmq \
        --disable-mqtt \
        --disable-unix-sockets \
        --enable-data-channels \
        --enable-all-handlers && \
    make -j"$(nproc)" && \
    make install && \
    make configs && \
    rm -rf /tmp/janus-gateway

# ── Runtime ──
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjansson4 libssl3 libglib2.0-0 libopus0 libogg0 \
    libcurl4 libconfig9 libnice10 libsrtp2-1 \
    libwebsockets16 libmicrohttpd12 \
    libusrsctp2 \
    ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/janus /opt/janus

RUN ldconfig

RUN mkdir -p /usr/local/etc/janus

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8188
EXPOSE 20000-20100/udp

ENTRYPOINT ["/entrypoint.sh"]
