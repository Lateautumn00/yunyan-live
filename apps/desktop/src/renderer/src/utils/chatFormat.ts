import { CHAT_LIMITS, type MentionTarget } from '@yunyan-live/types';
import type { RoomMember } from '@/store/room';

export { CHAT_LIMITS };

/** @提及补全选项（label 即正文 @ 后插入的展示名） */
export interface MentionOption {
  userId: string;
  label: string;
  isTeacher?: boolean;
}

/** 渲染分段：mention 存在则该段为提及高亮 */
export interface MessageSegment {
  text: string;
  mention?: MentionTarget;
}

/** 昵称清洗：仅接受 string，剔除控制字符，截断至 MAX_NAME_LENGTH（与服务端 bullet.ts 同语义） */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, CHAT_LIMITS.MAX_NAME_LENGTH);
}

/** 构建补全选项：教师置顶 '所有人'，其后为成员（同名不去重，首匹配生效） */
export function buildMentionOptions(
  members: readonly RoomMember[],
  isTeacher: boolean
): MentionOption[] {
  const options: MentionOption[] = [];
  if (isTeacher) options.push({ userId: 'all', label: '所有人', isTeacher: true });
  for (const member of members) {
    if (!member.opaqueId || !member.userName) continue;
    options.push({ userId: member.opaqueId, label: sanitizeName(member.userName) });
  }
  return options;
}

/**
 * 从正文提取命中补全选项的 @提及（发送侧载荷构建）。
 * 逐个 '@' 尝试最长 label 优先匹配；label 冲突取 options 中首个（同名成员首匹配）；按 userId 去重。
 */
export function extractMentions(text: string, options: readonly MentionOption[]): MentionTarget[] {
  const byLabel = new Map<string, string>();
  for (const option of options) {
    if (!byLabel.has(option.label)) byLabel.set(option.label, option.userId);
  }
  const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length);
  const found: MentionTarget[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    for (const label of labels) {
      if (!text.startsWith(`@${label}`, i)) continue;
      const userId = byLabel.get(label);
      if (userId !== undefined && !seen.has(userId)) {
        seen.add(userId);
        found.push({ userId, userName: label });
      }
      i += label.length;
      break;
    }
  }
  return found.slice(0, CHAT_LIMITS.MAX_MENTIONS);
}

/**
 * 渲染分段（基于发送侧载荷 mentions，与接收端成员名单解耦）。
 * 正文中每个可识别提及位置切出高亮段；载荷未包含的 @文本 保持普通段。
 */
export function segmentMessage(text: string, mentions: readonly MentionTarget[]): MessageSegment[] {
  if (!text) return [{ text: text ?? '' }];
  if (!mentions.length) return [{ text }];

  const byLabel = new Map<string, MentionTarget>();
  for (const mention of mentions) {
    if (!byLabel.has(mention.userName)) byLabel.set(mention.userName, mention);
  }
  const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length);

  const hits: Array<{ start: number; end: number; mention: MentionTarget }> = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    for (const label of labels) {
      if (!text.startsWith(`@${label}`, i)) continue;
      hits.push({ start: i, end: i + 1 + label.length, mention: byLabel.get(label)! });
      i += label.length;
      break;
    }
  }

  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) segments.push({ text: text.slice(cursor, hit.start) });
    segments.push({ text: text.slice(hit.start, hit.end), mention: hit.mention });
    cursor = hit.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/** 表情/文本插入纯函数：按当前选区切片插入，返回新值与恢复光标位置（禁直接写 DOM） */
export function insertAtCursor(
  text: string,
  start: number,
  end: number,
  insert: string
): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return {
    value: text.slice(0, from) + insert + text.slice(to),
    caret: from + insert.length
  };
}
