#!/usr/bin/env node
/**
 * 生成密码加密用 RSA-2048 密钥对。
 *
 * 产物：
 *  1. 公钥 → apps/desktop/src/renderer/src/utils/passwordPublicKey.ts（随客户端分发，可入库）
 *  2. 私钥 → 仅打印 env 行；加 --write-env 时写入/更新 apps/auth-service/.env 的 PASSWORD_PRIVATE_KEY
 *
 * 用法：
 *  node scripts/gen-password-keypair.mjs              # 生成并打印私钥 env 行
 *  node scripts/gen-password-keypair.mjs --write-env  # 同时写入 auth-service/.env
 *  node scripts/gen-password-keypair.mjs --force      # 覆盖已存在的产物
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_KEY_FILE = path.join(ROOT, 'apps/desktop/src/renderer/src/utils/passwordPublicKey.ts');
const ENV_FILE = path.join(ROOT, 'apps/auth-service/.env');
const ENV_KEY = 'PASSWORD_PRIVATE_KEY';

const args = process.argv.slice(2);
const writeEnv = args.includes('--write-env');
const force = args.includes('--force');

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      '用法: node scripts/gen-password-keypair.mjs [--write-env] [--force]',
      '',
      '  --write-env  将私钥写入/更新 apps/auth-service/.env 的 ' + ENV_KEY,
      '  --force      覆盖已存在的公钥文件 / .env 中的旧私钥',
      '',
      '注意: 私钥仅用于 auth-service 解密，禁止提交到仓库（.env 已在 .gitignore 中）。'
    ].join('\n')
  );
  process.exit(0);
}

if (fs.existsSync(PUBLIC_KEY_FILE) && !force) {
  console.log(`[gen:keys] 公钥文件已存在，跳过生成: ${PUBLIC_KEY_FILE}`);
  if (writeEnv) {
    console.log(
      '[gen:keys] 无法从已有公钥推导私钥：请将团队分发的 PASSWORD_PRIVATE_KEY 手动写入 apps/auth-service/.env。'
    );
  }
  console.log(
    '[gen:keys] 如需全新本地密钥对请加 --force（会更新仓库公钥，须同步更新所有环境的私钥）。'
  );
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' }
});

const privateKeyBase64 = privateKey.toString('base64');
const fingerprint = createHash('sha256').update(publicKey).digest('hex').match(/.{2}/g).join(':');

const fileContent = [
  '// 该文件由 scripts/gen-password-keypair.mjs 自动生成，请勿手动编辑。',
  '//',
  '// RSA-OAEP-SHA256 公钥（SPKI PEM），客户端用它加密密码后再发送。',
  '// 轮换步骤: 1) 本脚本加 --force 重新生成  2) 更新 auth-service .env 的',
  `// ${ENV_KEY}  3) 发布包含新公钥的桌面端版本。`,
  '',
  'export const PASSWORD_PUBLIC_KEY_PEM = `' + publicKey.trim() + '`;',
  ''
].join('\n');

fs.mkdirSync(path.dirname(PUBLIC_KEY_FILE), { recursive: true });
fs.writeFileSync(PUBLIC_KEY_FILE, fileContent, 'utf8');
console.log(`[gen:keys] 公钥已写入: ${PUBLIC_KEY_FILE}`);
console.log(`[gen:keys] SHA256 指纹: ${fingerprint}`);

const envLine = `${ENV_KEY}=${privateKeyBase64}`;

if (!writeEnv) {
  console.log('');
  console.log('私钥未写入文件。请手动将下面一行追加到 apps/auth-service/.env:');
  console.log(`  ${envLine}`);
  console.log('（或重新运行并加 --write-env 自动写入）');
  process.exit(0);
}

let envContent = '';
if (fs.existsSync(ENV_FILE)) {
  envContent = fs.readFileSync(ENV_FILE, 'utf8');
}
const keyLinePattern = new RegExp(`^${ENV_KEY}=.*$`, 'm');
if (keyLinePattern.test(envContent)) {
  if (!force) {
    console.log(`[gen:keys] ${ENV_FILE} 已存在 ${ENV_KEY}，跳过（如需轮换请加 --force）。`);
    process.exit(0);
  }
  envContent = envContent.replace(keyLinePattern, envLine);
} else {
  const prefix = envContent && !envContent.endsWith('\n') ? '\n' : '';
  envContent += `${prefix}# 密码 RSA-OAEP 解密私钥（PKCS8 DER base64，由 gen-password-keypair.mjs 生成，禁止入库）\n${envLine}\n`;
}
fs.writeFileSync(ENV_FILE, envContent, 'utf8');
console.log(`[gen:keys] 私钥已写入: ${ENV_FILE}`);
