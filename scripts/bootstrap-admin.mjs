/**
 * 批次 7 / GAP-F8：运维引导脚本 — 生成首条 admins 表 INSERT SQL。
 * 用法：node scripts/bootstrap-admin.mjs [username] [password] [role]
 * 默认：username=admin password=Admin@2025 role=1
 *
 * 输出可直接在 PostgreSQL 中执行的 SQL，密码使用 scrypt 哈希（与 admin-service 一致）。
 * 后续由超管通过 /admin/admins 端点创建更多管理员。
 */
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';

const [, username = 'admin', password = 'Admin@2025', roleArg = '1'] = process.argv;
const role = Number(roleArg);

const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt:$';

const salt = randomBytes(SALT_BYTES);
const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
const passwordHash = `${PREFIX}${SCRYPT_N}-${SCRYPT_R}-${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;

const id = randomUUID();
const now = new Date().toISOString();

const sql = `-- 批次 7 / GAP-F8：引导首个超管账号
-- 生成时间：${now}
-- username: ${username}
-- 执行方式：psql -U postgres -d yunyan_live -c "..." 或在 pgAdmin 中运行

INSERT INTO admins (
  "id", "username", "email", "password_hash", "role", "status", "last_login_at", "created_at", "updated_at"
) VALUES (
  '${id}',
  '${username}',
  NULL,
  '${passwordHash}',
  ${role},
  'active',
  NULL,
  ${now},
  ${now}
);

-- 验证：
-- SELECT id, username, role, status FROM admins WHERE username = '${username}';
`;

process.stdout.write(sql + '\n');
console.error(`\n提示：密码为 "${password}"（scrypt 哈希已生成，明文不落库）\n`);
console.error('执行后将 username/password 交给运维，引导完成后可禁用该 SQL 脚本或轮换密码。');
