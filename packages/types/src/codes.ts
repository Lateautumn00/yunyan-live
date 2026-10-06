/**
 * 全局业务响应码（HTTP `{code, msg, data}` 信封，见 ApiResult）。
 * 前端（@yunyan-live/http 拦截器）与后端（gateway 拦截器/filter）共用。
 */
export const ApiCode = {
  /** 成功 */
  SUCCESS: 1000,
  /** 视频转码中（回放下载轮询用） */
  TRANSCODING: 2002,
  /** 登录过期/未授权 */
  UNAUTHORIZED: 4001,
  /** 账号已在其他设备登录（被顶下线） */
  SESSION_KICKED: 4002,
  /** 资源不存在 */
  NOT_FOUND: 4003,
  /** 冲突 */
  CONFLICT: 4004
} as const;

/**
 * chat-ws 关闭码（WebSocket CloseEvent）。
 * 注意：yjs-ws 使用不同的 44xx 段且语义顺序相反，见 YjsClose。
 */
export const WsClose = {
  /** 未授权/会话过期（Token 缺失、无效、过期） */
  UNAUTHORIZED: 4001,
  /** 被顶下线（会话被另一登录替换） */
  SESSION_KICKED: 4002
} as const;

/**
 * yjs-ws 关闭码（y-websocket 将 44xx 视为终止码，不自动重连）。
 * 语义顺序与 chat-ws 相反：4401=顶下线、4402=会话无效。
 */
export const YjsClose = {
  /** 被顶下线 */
  SESSION_KICKED: 4401,
  /** 会话无效/过期 */
  SESSION_INVALID: 4402
} as const;

/** 规范分页请求（入口层负责把 pageNum/page/page_size 别名归一化到该形状） */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** 规范分页响应：`{ list, total }` */
export interface PageResult<T> {
  list: T[];
  total: number;
}

/** 分页响应（主流形状）：`{ list, pageInfo: { totalElements } }` */
export interface PageListResult<T> {
  list: T[];
  pageInfo: { totalElements: number };
}
