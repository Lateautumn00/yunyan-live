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

/** bullet 广播信封：外层结构保持不变，仅 liveMsg 增量字段 */
export interface BulletEnvelope {
  type: 'bullet';
  data: {
    liveMsg?: BulletLiveMsg;
    info?: BulletSenderInfo;
  };
}

/** 拒发回执（仅回发送者；旧客户端 default 分支安全忽略） */
export type BulletRejectReason = 'forbidden' | 'too_long' | 'invalid' | 'not_joined';

export interface BulletRejectedMessage {
  type: 'bullet_rejected';
  reason: BulletRejectReason;
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
