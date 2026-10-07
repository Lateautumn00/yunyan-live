/** @提及目标（广播信封增量字段；userId 为 Janus opaqueId，'all' 表示 @所有人） */
export interface MentionTarget {
  userId: string;
  userName: string;
}

/** @提及 / 时间戳相关限制（两端共用，度量统一为 String.length = UTF-16 码元） */
export const CHAT_LIMITS = {
  /** 消息正文最大长度（超长服务端截断至该值） */
  MAX_MESSAGE_LENGTH: 200,
  /** 单条 mentions 条目 userName 最大长度 */
  MAX_MENTION_NAME_LENGTH: 64,
  /** 单条消息最多携带的 mentions 条目数（超出截断） */
  MAX_MENTIONS: 50,
  /** 昵称（liveMsg.name）最大长度 */
  MAX_NAME_LENGTH: 50
} as const;

/** 弹幕正文载荷（广播信封 data.liveMsg；mentions/time 为增量可选字段，旧客户端忽略） */
export interface BulletLiveMsg {
  msg?: string;
  roomId?: string;
  name?: string;
  /** 服务端权威注入的发送时间戳（ms）；旧服务端不带，客户端只展示不校验 */
  time?: number;
  mentions?: MentionTarget[];
  /** 白板广播早退标记（保留既有语义） */
  info?: { host?: string };
}

/** 广播信封 data.info（isTeacher 由服务端按 JWT 重建；liveUserId 为连接期声明） */
export interface BulletSenderInfo {
  type?: number;
  isTeacher?: boolean;
  liveUserId?: string;
}

/** bullet 广播信封：外层结构保持不变，liveMsg/info 增量字段 + data 层 msgId */
export interface BulletEnvelope {
  type: 'bullet';
  data: {
    /** 服务端注入的消息 UUID（客户端伪造将被重建覆盖；旧服务端不带） */
    msgId?: string;
    liveMsg?: BulletLiveMsg;
    info?: BulletSenderInfo;
  };
}

/** 拒发回执（仅回发送者；旧客户端 default 分支安全忽略） */
export type BulletRejectReason =
  'forbidden' | 'too_long' | 'invalid' | 'not_joined' | 'rate_limited';

export interface BulletRejectedMessage {
  type: 'bullet_rejected';
  reason: BulletRejectReason;
}

/** 历史回放页大小（进场 push 与 getHistory 翻页共用，服务端固定不接受 limit 参数） */
export const CHAT_HISTORY_PAGE_SIZE = 50;

/** 历史条目（data 层结构与 bullet 同构，可复用 bullet 消费逻辑；含 data.msgId） */
export type HistoryEntry = BulletEnvelope['data'];

export interface HistoryMessage {
  type: 'history';
  data: { messages: HistoryEntry[]; nextCursor: string | null };
}

export interface HistoryPageMessage {
  type: 'historyPage';
  data: { messages: HistoryEntry[]; nextCursor: string | null };
}

/**
 * historyError 终态/可重试语义：
 * - invalid_cursor / persistence_disabled → 客户端 hasMore=false（停止翻页）
 * - unavailable（查询超时/PG 读失败）→ 客户端不改 hasMore，可再次触发
 */
export type HistoryErrorMessageReason = 'invalid_cursor' | 'persistence_disabled' | 'unavailable';

export interface HistoryErrorMessage {
  type: 'historyError';
  data: { reason: HistoryErrorMessageReason };
}

/** 翻页请求（roomId 由服务端取连接期权威值，客户端只带游标） */
export interface GetHistoryMessage {
  type: 'getHistory';
  data: { cursor?: string };
}

/** 连接建立 / msg 轮询下发的房间状态（forbid 语义：0=禁言，1=可发言） */
export interface RoomStateMessage {
  type: 'msg';
  data: { liveMsg: { liveNums?: number; forbid?: number } };
}

/**
 * 客户端消息列表条目（BulletEnvelope 派生的展示模型，不参与传输）。
 * 时间戳/提及一律以服务端载荷为唯一事实源；segments/mentionMe 等本地派生字段由渲染层扩展。
 */
export interface ChatMessageItem {
  /** 服务端消息 UUID（与广播信封 data.msgId 同源；旧服务端消息缺失，回退 keyOf 本地键） */
  msgId?: string;
  userName?: string;
  message?: string;
  isMe?: boolean;
  isTeacher?: boolean;
  liveUserId?: string;
  liveUser?: boolean;
  /** 展示用时间（ms）：优先服务端 time，缺失回退客户端接收时间 */
  time?: number;
  mentions?: MentionTarget[];
}
