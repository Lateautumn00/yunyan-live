const HTTP_ORIGIN_RE = /^https?:\/\//i;

function trimBase(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

/**
 * 解析分享链接的站点根地址。
 * 优先取显式配置（VITE_SHARE_BASE_URL，Web 部署域名）；未配置时回退
 * window.location.origin —— 仅当它是 http(s) 源（dev server / Web 部署），
 * Electron file:// 等非 http 源返回空串，调用方以“未配置”空态呈现，
 * 不再允许任何假占位地址。
 */
export function resolveShareOrigin(raw?: string | null): string {
  const configured = (raw ?? '').trim();
  if (configured) {
    return HTTP_ORIGIN_RE.test(configured) ? trimBase(configured) : '';
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return HTTP_ORIGIN_RE.test(origin) ? trimBase(origin) : '';
}

export function getShareOrigin(): string {
  return resolveShareOrigin(import.meta.env.VITE_SHARE_BASE_URL);
}

/**
 * 拼分享链接：`<origin>/#/join?room=<roomId>&code=<joinCode>`（hash 路由）。
 * 任一要素缺失或 origin 非 http(s) → 返回空串（调用方显示未配置空态、禁用复制）。
 */
export function buildShareUrl(base: string, roomId?: string, joinCode?: string): string {
  const origin = trimBase(base ?? '');
  const room = (roomId ?? '').trim();
  const code = (joinCode ?? '').trim();
  if (!HTTP_ORIGIN_RE.test(origin) || !room || !code) return '';
  return `${origin}/#/join?room=${encodeURIComponent(room)}&code=${encodeURIComponent(code)}`;
}
