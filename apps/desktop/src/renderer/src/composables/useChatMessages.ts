import { ref, type Ref } from 'vue';
import type { ChatMessageItem, MentionTarget } from '@yunyan-live/types';
import { segmentMessage, type MessageSegment } from '@/utils/chatFormat';

export type DisplayMessage = ChatMessageItem & {
  segments: MessageSegment[];
  mentionMe: boolean;
  showTime: boolean;
};

/** 服务端信封 data（bullet / history 条目同构）的宽松输入面 */
export interface ChatEntry {
  msgId?: unknown;
  liveMsg?: {
    msg?: unknown;
    roomId?: unknown;
    name?: unknown;
    time?: unknown;
    mentions?: unknown;
    info?: { host?: unknown };
  };
  info?: { liveUserId?: unknown; isTeacher?: unknown; senderId?: unknown };
}

/** 消息列表硬上限：头部裁剪（index key + 裁剪 = 全量重渲染，故 :key 必须绑定 msgId/keyOf） */
export const MESSAGE_LIST_LIMIT = 500;
/** 已见键有界 FIFO：大于该值后淘汰最旧键（被裁剪消息的键仍应可判重，覆盖重连重叠窗） */
export const SEEN_KEYS_LIMIT = 1500;
/** 分组时间间隔：超过该间隔的新消息重新显示时间 */
export const TIME_GAP_MS = 5 * 60 * 1000;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 稳定本地键（msgId 缺席时的回退）：
 * - 服务端 time 恒为 number；非 number 不进键（不产伪造时间键）
 * - 键形 `msgId|time|name|msg`，与展示面同源，bullet/history 双路径一致
 */
export function keyOf(source: ChatEntry | DisplayMessage): string {
  const msgId = typeof source.msgId === 'string' ? source.msgId : '';
  if ('liveMsg' in source) {
    const lm = source.liveMsg;
    const t = num(lm?.time);
    return [msgId, t === null ? '' : String(t), str(lm?.name), str(lm?.msg)].join('|');
  }
  const d = source as DisplayMessage;
  const t = num(d.time);
  return [msgId, t === null ? '' : String(t), str(d.userName), str(d.message)].join('|');
}

export interface ChatMessagesDeps {
  /** 自身身份（每次构建时读取，保持 props 响应性）；guid = 稳定账号 ID（userStore.guid），优先用于跨会话 self 判定 */
  self: () => { liveUserId: string; isTeacher: boolean; guid: string };
}

export interface ChatMessages {
  messages: Ref<DisplayMessage[]>;
  /** 实时 bullet：msgId/键去重 → 追加 → 裁剪 → 分组重算；返回是否真正入列 */
  appendLive(entry: ChatEntry): boolean;
  /** history/historyPage 升序批次：键去重 → 双向有序合并（不重排既有序）→ 裁剪 → 分组重算 */
  mergeHistory(entries: readonly ChatEntry[]): boolean;
  /** 未读门（单一漏斗）：time > maxSeenTime（首连 history 不走此门 → 不计未读） */
  isUnread(time: number): boolean;
  /** maxSeenTime 快照（测试断言用） */
  maxSeenTime(): number;
  /** 稳定键（:key 绑定；与去重键同源） */
  keyOf(source: ChatEntry | DisplayMessage): string;
}

function toDisplay(
  entry: ChatEntry,
  self: { liveUserId: string; isTeacher: boolean; guid: string }
): DisplayMessage {
  const liveMsg = entry.liveMsg ?? {};
  const msg = str(liveMsg.msg);
  const rawMentions = Array.isArray(liveMsg.mentions) ? (liveMsg.mentions as MentionTarget[]) : [];
  const mentions = rawMentions.filter(m => m && typeof m.userId === 'string');
  // self 判定：优先稳定 senderId（JWT sub，跨会话可比）；旧服务端不带时回退会话级 liveUserId
  const senderId = str(entry.info?.senderId);
  const isMe =
    senderId !== ''
      ? self.guid !== '' && senderId === self.guid
      : str(entry.info?.liveUserId) === self.liveUserId && self.liveUserId !== '';
  const mentionMe = !isMe && mentions.some(m => m.userId === self.liveUserId || m.userId === 'all');
  return {
    msgId: typeof entry.msgId === 'string' ? entry.msgId : undefined,
    userName: str(liveMsg.name),
    message: msg,
    isMe,
    isTeacher: entry.info?.isTeacher === true,
    liveUserId: senderId !== '' ? senderId : str(entry.info?.liveUserId),
    time: num(liveMsg.time) ?? Date.now(),
    mentions: mentions.length ? mentions : undefined,
    segments: segmentMessage(msg, mentions),
    mentionMe,
    liveUser: false,
    showTime: false
  };
}

/** 白板早退标记（liveMsg.info.host 存在）：客户端本就不渲染 */
function isHostMarked(entry: ChatEntry): boolean {
  return entry.liveMsg?.info !== undefined && entry.liveMsg.info.host !== undefined;
}

/** 全量分组重算：依赖最终相邻关系（prepend 后原首条 .msg-time 不重复 / 5min 边界对齐） */
function recomputeGroups(list: DisplayMessage[]): void {
  for (let i = 0; i < list.length; i += 1) {
    const cur = list[i];
    if (!cur) continue;
    const prev = i > 0 ? list[i - 1] : undefined;
    cur.liveUser = !!prev && prev.liveUserId == cur.liveUserId;
    const gap = (cur.time ?? 0) - (prev?.time ?? 0);
    cur.showTime = !prev || !cur.liveUser || gap > TIME_GAP_MS;
  }
}

export function useChatMessages(deps: ChatMessagesDeps): ChatMessages {
  const messages = ref<DisplayMessage[]>([]);
  const seen = new Set<string>();
  let maxSeen = 0;

  function markSeen(key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > SEEN_KEYS_LIMIT) {
      const oldest = seen.values().next();
      if (!oldest.done) seen.delete(oldest.value);
    }
    return true;
  }

  function noteTime(t: number | null) {
    if (t !== null && t > maxSeen) maxSeen = t;
  }

  function trim() {
    if (messages.value.length > MESSAGE_LIST_LIMIT) {
      messages.value.splice(0, messages.value.length - MESSAGE_LIST_LIMIT);
    }
  }

  function appendLive(entry: ChatEntry): boolean {
    if (isHostMarked(entry)) return false;
    if (!markSeen(keyOf(entry))) return false;
    const built = toDisplay(entry, deps.self());
    noteTime(num(entry.liveMsg?.time));
    messages.value.push(built);
    trim();
    recomputeGroups(messages.value);
    return true;
  }

  function mergeHistory(entries: readonly ChatEntry[]): boolean {
    const batch: DisplayMessage[] = [];
    const batchKeys: string[] = [];
    for (const entry of entries) {
      if (isHostMarked(entry)) continue;
      const k = keyOf(entry);
      if (seen.has(k)) continue;
      batch.push(toDisplay(entry, deps.self()));
      batchKeys.push(k);
      noteTime(num(entry.liveMsg?.time));
    }
    if (batch.length === 0) return false;

    // 双方均已按时间升序（local 由构造保证；batch 服务端 ASC 下发）→ 归并，平局保留 local 在前（不重排）
    const local = messages.value;
    const merged: DisplayMessage[] = [];
    let li = 0;
    let bi = 0;
    while (li < local.length || bi < batch.length) {
      const l = li < local.length ? local[li] : undefined;
      const b = bi < batch.length ? batch[bi] : undefined;
      if (l && b) {
        if ((l.time ?? 0) <= (b.time ?? 0)) {
          merged.push(l);
          li += 1;
        } else {
          merged.push(b);
          bi += 1;
        }
      } else if (l) {
        merged.push(l);
        li += 1;
      } else if (b) {
        merged.push(b);
        bi += 1;
      }
    }

    for (const k of batchKeys) markSeen(k);
    messages.value = merged;
    trim();
    recomputeGroups(messages.value);
    return true;
  }

  const isUnread = (time: number): boolean => time > maxSeen;

  return {
    messages,
    appendLive,
    mergeHistory,
    isUnread,
    maxSeenTime: () => maxSeen,
    keyOf
  };
}
