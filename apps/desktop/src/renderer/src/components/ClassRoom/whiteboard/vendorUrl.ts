// 外挂 vendor 资源寻址（F3.4/F3.5）：
// dev 下 Vite public 直接服务 /vendor/*，但为统一走 main 侧校验与 prod atom:// 策略，
// 一律经 preload vendorGetUrl IPC；路径穿越在 renderer 与 main 双侧拒绝。

const SAFE_REL = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+$/;

export async function vendorUrl(relPath: string): Promise<string> {
  if (!SAFE_REL.test(relPath)) {
    throw new Error(`非法 vendor 路径: ${relPath}`);
  }
  const getUrl = window.electronAPI?.vendorGetUrl;
  if (!getUrl) throw new Error('vendor 资源接口不可用');
  return getUrl(relPath);
}
