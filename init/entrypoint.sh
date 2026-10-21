#!/bin/bash
set -e

# ── Environment variable defaults ─────────────────────────────────────────────
GATEWAY_IP="${GATEWAY_IP:-0.0.0.0}"
# 留空 = 禁用 STUN（docker dev 环境 GFW 会阻断 stun.l.google.com 导致 janus FATAL 退出）
# 生产/需要 NAT 穿透时在 .env 配置可达的 STUN 服务器
STUN_SERVER="${STUN_SERVER:-}"
STUN_PORT="${STUN_PORT:-19302}"
RTP_PORT_RANGE="${RTP_PORT_RANGE:-20000-20100}"
SERVER_NAME="${SERVER_NAME:-JanusServer}"
DISABLED_PLUGINS="${DISABLED_PLUGINS:-}"
DISABLED_TRANSPORTS="${DISABLED_TRANSPORTS:-}"

RTP_MIN=$(echo "$RTP_PORT_RANGE" | cut -d- -f1)
RTP_MAX=$(echo "$RTP_PORT_RANGE" | cut -d- -f2)

CONFIG_DIR="/usr/local/etc/janus"

mkdir -p "$CONFIG_DIR"

# STUN 配置片段：STUN_SERVER 为空则不写 stun_server/stun_port（janus 对空值会 FATAL 退出）
if [ -n "$STUN_SERVER" ]; then
  NAT_STUN="    stun_server = \"${STUN_SERVER}\"
    stun_port = ${STUN_PORT}"
else
  NAT_STUN="    # STUN disabled (JANUS_STUN_SERVER empty)"
fi

# ── Generate janus.jcfg ──────────────────────────────────────────────────────
cat > "$CONFIG_DIR/janus.jcfg" <<EOF
general: {
    configs_folder = "${CONFIG_DIR}"
    plugins_folder = "/opt/janus/lib/janus/plugins"
    transports_folder = "/opt/janus/lib/janus/transports"
    events_folder = "/opt/janus/lib/janus/events"
    loggers_folder = "/opt/janus/lib/janus/loggers"
    log_to_stdout = true
    debug_level = 4
    admin_secret = "janusadmin"
    server_name = "${SERVER_NAME}"
    session_timeout = 60
    token_auth = false
    token_auth_secret = "janusadmin"
}

nat: {
    nice_debug = false
    full_trickle = true
    ice_lite = false
    ice_tcp = false
${NAT_STUN}
    no_default_rtp_port = false
    rtp_port_range = "${RTP_MIN},${RTP_MAX}"
}

media: {
    rtp_port_range = "${RTP_MIN},${RTP_MAX}"
}

certificates: {
}
EOF

# ── Generate janus.transport.websockets.jcfg ──────────────────────────────────
cat > "$CONFIG_DIR/janus.transport.websockets.jcfg" <<EOF
general: {
    json = "indented"
    ws = true
    ws_port = 8188
    wss = false
    wss_port = 8889
    ws_interface = "0.0.0.0"
    ws_advertised_interface = ""
    ws_advertised_port = 0
    ws_path = "/janus"
    ws_allowed_origins = "*"
    admin_ws = false
    admin_ws_port = 8189
}

admin: {
}
EOF

# ── Generate janus.transport.http.jcfg ───────────────────────────────────────
cat > "$CONFIG_DIR/janus.transport.http.jcfg" <<EOF
general: {
    json = "indented"
    http = true
    port = 8088
    ip = "0.0.0.0"
    advertised_interface = ""
    advertised_port = 0
    base_path = "/janus"
    allow_cors = true
    cors_with_credentials = true
    https = false
}

admin: {
    admin_base_path = "/admin"
}
EOF

# ── Generate janus.plugin.videoroom.jcfg ──────────────────────────────────────
cat > "$CONFIG_DIR/janus.plugin.videoroom.jcfg" <<EOF
general: {
    events = true
    lock_rtp_forward = true
    string_ids = false
}

room-1234: {
    description = "Demo Room"
    pin = ""
    require_pvtid = false
    publishers = 6
    bitrate = 512000
    fir_freq = 10
    videocodec = "vp8,h264"
    audiocodec = "opus"
    record = false
    rec_dir = "/tmp/janus/recordings"
    notify_joining = false
    autocheck = true
    audio_level_average = 25
    videoorient_ext = true
    playoutdelay_ext = true
    transport_wide_cc_ext = true
}
EOF

# ── Generate janus.plugin.textroom.jcfg ───────────────────────────────────────
cat > "$CONFIG_DIR/janus.plugin.textroom.jcfg" <<EOF
general: {
    events = true
}

admin: {
}
EOF

# ── Generate janus.plugin.recordplay.jcfg ─────────────────────────────────────
cat > "$CONFIG_DIR/janus.plugin.recordplay.jcfg" <<EOF
general: {
    path = "/tmp/janus/recordings"
    events = true
}

admin: {
}
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Janus WebRTC Server - Configuration generated"
echo "  Gateway IP : ${GATEWAY_IP}"
echo "  STUN Server: ${STUN_SERVER}:${STUN_PORT}"
echo "  RTP Range  : ${RTP_PORT_RANGE}"
echo "  WS Port    : 8188"
echo "  HTTP Port  : 8088"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exec /opt/janus/bin/janus -F "$CONFIG_DIR"
