// adapter.min 是 UMD：dev（纯 ESM 执行）走 window.adapter 分支；生产构建被 Rollup 按 CJS 包装
// （export default require(...)），window.adapter 不会被设置，live.js 内裸引用 adapter 将抛
// ReferenceError（打包版「直播服务初始化失败」）。此处统一取值并回填 window，供 live.js 全局引用。
import * as adapterModule from '@/vendor/live/adapter/adapter.min';

type AdapterModule = { default?: unknown };

const adapter = (adapterModule as AdapterModule).default ?? window.adapter;

if (adapter && !window.adapter) {
  window.adapter = adapter;
}

export default adapter;
