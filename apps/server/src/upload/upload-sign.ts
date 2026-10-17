import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * S3：/uploads 读取侧 HMAC 路径签名（无过期）。
 *
 * 设计决策（GAP-S3，台账 §10 2026-10-17 拍板）：
 * - URL 形态 `/uploads/<sig>/<path>`，sig = base64url(HMAC-SHA256(secret, canonicalPath)) 前 22 字符（≈128bit）。
 * - **无过期**：上传 URL 会持久化进 Yjs 白板（图片/课件引用），过期签名会弄坏历史房间回放。
 * - **不走 Authorization 头**：pdf.js（`pdfjs.getDocument({url})`）与 `<img>` 元素无法携带自定义头，
 *   读取侧只能靠路径本身携带凭证；`main.ts` 对 /uploads 保留 ACAO: *（F6.1 pdf.js Origin: null 读像素依赖）。
 * - 验签失败/老格式（无 sig 段）一律 404，不泄露文件存在性。
 * - 写入侧（POST /upload/*）由 JwtAuthGuard 保护，与本模块正交。
 *
 * 密钥：`UPLOAD_SIGNING_SECRET`（部署机须持久配置；缺失时进程内随机生成并告警——重启即失效，
 * 仅限本地开发，见 README「备份与恢复/部署机环境变量」清单）。
 */

const SIG_LEN = 22; // base64url 22 chars ≈ 132 bit，截断 128bit

let cachedSecret: string | null = null;
let warnedMissingSecret = false;

export function getUploadSecret(): string {
  const fromEnv = process.env.UPLOAD_SIGNING_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (!cachedSecret) {
    cachedSecret = randomBytes(32).toString('hex');
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        '[upload-sign] UPLOAD_SIGNING_SECRET 未配置（或短于 16 字符），使用进程随机密钥：重启后历史签名 URL 全部失效。部署机必须配置持久密钥。'
      );
    }
  }
  return cachedSecret;
}

/** canonicalPath 形如 `/uploads/images/a.png`（不含签名段、不含 query） */
export function signUploadPath(canonicalPath: string): string {
  return createHmac('sha256', getUploadSecret())
    .update(canonicalPath)
    .digest('base64url')
    .slice(0, SIG_LEN);
}

/** 构造签名 URL：relPath 形如 `images/a.png`（相对 /uploads/ 的真实路径） */
export function buildSignedUploadUrl(baseUrl: string, relPath: string): string {
  const canonical = `/uploads/${relPath}`;
  const sig = signUploadPath(canonical);
  return `${baseUrl}/uploads/${sig}/${relPath}`;
}

/**
 * 验签中间件：挂载于 `/uploads` 之前（见 main.ts）。
 * 合法签名 → 剥掉签名段重写 req.url 交静态托管；非法/老格式 → 404。
 */
export function uploadVerifyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawUrl = req.url; // express 挂载点内已剥去 /uploads 前缀？否——app.use('/uploads', fn) 内 req.url 已剥前缀，这里统一用 originalUrl 下的完整 path 更稳
  const path = (req.originalUrl || rawUrl).split('?')[0];
  const queryIndex = (req.originalUrl || rawUrl).indexOf('?');
  const query = queryIndex >= 0 ? (req.originalUrl || rawUrl).slice(queryIndex) : '';

  const m = /^\/uploads\/([A-Za-z0-9_-]{22})\/(.+)$/.exec(path);
  if (!m) {
    // 老格式（无签名段）/ 非白名单路径：404，不改写
    res.status(404).end();
    return;
  }
  const sig = m[1] as string;
  const relPath = m[2] as string;
  const expected = signUploadPath(`/uploads/${relPath}`);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(404).end();
    return;
  }
  // 通过：重写为无签名路径交静态托管（挂载在 /uploads 下时 req.url 相对挂载点）
  req.url = `/${relPath}${query}`;
  next();
}
