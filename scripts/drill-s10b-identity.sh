#!/usr/bin/env bash
# GAP-S10b 演练：① 伪造 user_id metadata 被拒 ② 跨容器网络隔离（DoD 证据）
# 前置：cd init && docker compose --profile app up -d --build   （新网络 + GRPC_SHARED_SECRET 生效）
# 用法：bash scripts/drill-s10b-identity.sh
# 结论：全部 PASS 退出码 0；任一 FAIL 退出码 1。输出归档至 docs/research/drills/s10b-identity-record.md
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ok() {
  echo "PASS  $1"
  PASS=$((PASS + 1))
}
bad() {
  echo "FAIL  $1"
  FAIL=$((FAIL + 1))
}

# 探测容器内到目标 TCP 可达性：nc → bash /dev/tcp → node net 三级回退
tcp_up() {
  local c="$1" h="$2" p="$3"
  docker exec "$c" sh -c "nc -z -w 2 $h $p" >/dev/null 2>&1 ||
    docker exec "$c" bash -c "echo > /dev/tcp/$h/$p" >/dev/null 2>&1 ||
    docker exec "$c" node -e "const s=require('net').connect($p,'$h',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" >/dev/null 2>&1
}

probe() {
  local c="$1" h="$2" p="$3" want="$4" desc="$5" got
  if tcp_up "$c" "$h" "$p"; then got=ok; else got=fail; fi
  if [ "$got" = "$want" ]; then ok "$desc [$c -> $h:$p = $got]"
  else bad "$desc [$c -> $h:$p = $got, want $want]"; fi
}

host_up() {
  timeout 2 bash -c "echo > /dev/tcp/$1/$2" >/dev/null 2>&1
}

host_probe() {
  local h="$1" p="$2" want="$3" desc="$4" got
  if host_up "$h" "$p"; then got=ok; else got=fail; fi
  if [ "$got" = "$want" ]; then ok "$desc [host -> $h:$p = $got]"
  else bad "$desc [host -> $h:$p = $got, want $want]"; fi
}

echo '===== 0. 前置状态 ====='
GATEWAY=$(docker inspect yunyan-live-auth --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || echo '?')
echo "compose project: $GATEWAY"
docker compose -f init/docker-compose.yml --profile app ps --format '{{.Name}} {{.Status}}' 2>/dev/null || docker ps --format '{{.Names}} {{.Status}}'

echo
echo '===== 1. 网络成员（隔离基础） ====='
for net in edge backend egress; do
  members=$(docker network inspect "${GATEWAY}_${net}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)
  echo "${net}: ${members:-<missing>}"
done
if docker network inspect "${GATEWAY}_backend" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw 'yunyan-live-auth'; then
  ok 'backend 含 auth'
else
  bad 'backend 含 auth'
fi
if docker network inspect "${GATEWAY}_edge" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw 'yunyan-live-auth'; then
  bad 'edge 不含 auth（隔离破坏）'
else
  ok 'edge 不含 auth'
fi
if docker network inspect "${GATEWAY}_egress" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw 'yunyan-live-mail'; then
  ok 'egress 含 mail'
else
  bad 'egress 含 mail'
fi

echo
echo '===== 2. 跨容器网络隔离矩阵 ====='
probe yunyan-live-chat-ws auth-service 50051 fail 'chat-ws 不可达 auth gRPC'
probe yunyan-live-chat-ws live-service 50052 fail 'chat-ws 不可达 live gRPC'
probe yunyan-live-chat-ws mail-service 50053 fail 'chat-ws 不可达 mail gRPC'
probe yunyan-live-alertmanager live-service 50052 fail 'alertmanager 不可达 live gRPC'
probe yunyan-live-gateway auth-service 50051 ok 'gateway 可达 auth gRPC'
probe yunyan-live-gateway live-service 50052 ok 'gateway 可达 live gRPC'
probe yunyan-live-gateway mail-service 50053 ok 'gateway 可达 mail gRPC'
probe yunyan-live-yjs-ws live-service 50052 ok 'yjs-ws 可达 live gRPC'
probe yunyan-live-auth mail-service 50053 ok 'auth 可达 mail gRPC'
probe yunyan-live-live janus-gateway 8088 ok 'live 可达 janus 管理口'
probe yunyan-live-prometheus auth-service 9464 ok 'prometheus 可达 auth metrics'
probe yunyan-live-chat-ws postgres 5432 ok 'chat-ws 仍可达 postgres(edge 共享)'
host_probe 127.0.0.1 50051 fail '宿主不可达 auth gRPC（未发布端口）'
host_probe 127.0.0.1 3001 ok '宿主可达 gateway HTTP（发布端口对照）'

echo
echo '===== 3. 伪造 user_id metadata 被拒（真实 auth 容器） ====='
docker exec -i yunyan-live-gateway node - <<'NODE_EOF'
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const crypto = require('crypto');
const proto = '/app/packages/nest-shared/src/protos/auth.proto';
const pkg = grpc.loadPackageDefinition(
  loader.loadSync(proto, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
);
const client = new pkg.auth.AuthService('auth-service:50051', grpc.credentials.createInsecure());
const SECRET = process.env.GRPC_SHARED_SECRET;
if (!SECRET) {
  console.log('FAIL  gateway 容器缺 GRPC_SHARED_SECRET');
  process.exit(1);
}
function call(md) {
  return new Promise(resolve => client.Login({ email: 'x@x.com', password: 'x' }, md, (e) => resolve(e ? e.code : 0)));
}
function signed(userId, secret) {
  const md = new grpc.Metadata();
  const ts = String(Date.now());
  md.set('user-id', userId);
  md.set('user-ts', ts);
  md.set('user-sig', crypto.createHmac('sha256', secret).update(`${userId}:${ts}`).digest('hex'));
  return md;
}
(async () => {
  let failed = 0;
  const check = (name, got, want) => {
    const pass = want === 'non-16' ? got !== 16 : got === want;
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  forged=${name} code=${got} want=${want}`);
  };
  const bare = new grpc.Metadata();
  bare.set('user-id', 'attacker');
  check('bare-user-id(无签名)', await call(bare), 16);
  check('wrong-secret', await call(signed('u1', 'wrong-secret')), 16);
  const stale = signed('u1', SECRET);
  stale.remove('user-ts');
  stale.set('user-ts', String(Date.now() - 10 * 60_000));
  check('stale-ts(过期10min)', await call(stale), 16);
  check('valid-signature', await call(signed('u1', SECRET)), 'non-16');
  check('no-user-id(系统调用)', await call(new grpc.Metadata()), 'non-16');
  process.exit(failed ? 1 : 0);
})();
NODE_EOF
if [ $? -eq 0 ]; then ok '伪造调用 5 用例全符合预期'; else bad '伪造调用存在反例（见上）'; fi

echo
echo '===== 结果 ====='
echo "PASS=$PASS FAIL=$FAIL"
if [ "$FAIL" -eq 0 ]; then echo 'ALL PASS'; exit 0; else echo 'HAS FAILURE'; exit 1; fi
