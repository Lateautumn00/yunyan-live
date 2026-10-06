import { CHAT_LIMITS, type BulletRejectReason, type MentionTarget } from '@yunyan-live/types';
import { FORBID_FORBIDDEN } from '@yunyan-live/nest-shared';

/** 连接期身份上下文（JWT 角色权威；其余为连接 URL 客户端声明） */
export interface BulletContext {
  roomId: string;
  /** 连接 URL nickName（客户端声明） */
  nickName: string;
  /** 连接 URL liveUserId（Janus opaqueId，客户端声明） */
  liveUserId: string;
  /** JWT 重建：payload.role === 1 */
  isTeacher: boolean;
  /** 房间禁言态：0=禁言 1=可发言；undefined=未知（fail-open 放行，与 readForbid 一致） */
  forbid?: number;
}

/**
 * 构建结果。注意：本服务 tsconfig 为 `strict:false`，TS 不会对判别式联合做收窄，
 * 故用单形状结构（payload/reason 二选一存在）而非联合类型。
 */
export interface BuildBulletResult {
  ok: boolean;
  /** ok=true 时为可直接广播的信封字符串 */
  payload?: string;
  /** ok=false 时为拒发原因 */
  reason?: BulletRejectReason;
}

/** 昵称清洗：仅接受 string，剔除控制字符，截断至 MAX_NAME_LENGTH */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, CHAT_LIMITS.MAX_NAME_LENGTH);
}

/** mentions 清洗：非数组返回 null（整条拒）；非法条目丢弃；name 截断 64；超 50 条截断；非教师剥离 'all' */
function sanitizeMentions(raw: unknown, isTeacher: boolean): MentionTarget[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out: MentionTarget[] = [];
  for (const item of raw) {
    if (out.length >= CHAT_LIMITS.MAX_MENTIONS) break;
    if (typeof item !== 'object' || item === null) continue;
    const { userId, userName } = item as { userId?: unknown; userName?: unknown };
    if (typeof userId !== 'string' || userId === '') continue;
    if (typeof userName !== 'string') continue;
    if (userId === 'all' && !isTeacher) continue;
    out.push({
      userId,
      userName: userName.slice(0, CHAT_LIMITS.MAX_MENTION_NAME_LENGTH)
    });
  }
  return out;
}

/**
 * 弹幕强制边界（纯函数，全同步）：
 * 解析 → 空/长度（超长截断至 200，不拒发：旧客户端无 maxlength）→ 禁言极性 →
 * 身份重建（isTeacher=JWT 权威，name/liveUserId=连接期声明优先）→ mentions 清洗 → 注入 time。
 */
export function buildBullet(raw: string, ctx: BulletContext): BuildBulletResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'invalid' };
  }

  const envelope = parsed as {
    type?: unknown;
    data?: {
      liveMsg?: {
        msg?: unknown;
        roomId?: unknown;
        name?: unknown;
        mentions?: unknown;
        info?: { host?: unknown };
      };
      info?: { type?: unknown; isTeacher?: unknown; liveUserId?: unknown };
    };
  };
  if (envelope.type !== 'bullet') return { ok: false, reason: 'invalid' };

  const liveMsg = envelope.data?.liveMsg;
  const text = liveMsg?.msg;
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'invalid' };
  }

  // 禁言极性：FORBID_FORBIDDEN(0)=禁言且非教师 → 拒；undefined/1 放行（fail-open）
  if (ctx.forbid === FORBID_FORBIDDEN && !ctx.isTeacher) {
    return { ok: false, reason: 'forbidden' };
  }

  const mentions = sanitizeMentions(liveMsg?.mentions, ctx.isTeacher);
  if (mentions === null) return { ok: false, reason: 'invalid' };

  const name =
    sanitizeName(ctx.nickName) ||
    sanitizeName(typeof liveMsg?.name === 'string' ? liveMsg.name : '');
  const liveUserId =
    ctx.liveUserId ||
    (typeof envelope.data?.info?.liveUserId === 'string' ? envelope.data.info.liveUserId : '');
  const payloadInfoType =
    typeof envelope.data?.info?.type === 'number' ? envelope.data.info.type : undefined;

  const rebuilt = {
    type: 'bullet',
    data: {
      liveMsg: {
        msg: text.slice(0, CHAT_LIMITS.MAX_MESSAGE_LENGTH),
        roomId: ctx.roomId,
        name,
        time: Date.now(),
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(liveMsg?.info !== undefined ? { info: liveMsg.info } : {})
      },
      info: {
        ...(payloadInfoType !== undefined ? { type: payloadInfoType } : {}),
        isTeacher: ctx.isTeacher,
        liveUserId
      }
    }
  };
  return { ok: true, payload: JSON.stringify(rebuilt) };
}
