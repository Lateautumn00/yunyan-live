import type { NotifyKind } from '@yunyan-live/nest-shared';

/** HTML 转义：title 等字段来自用户输入，防模板注入 */
export function htmlEscape(v: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(v ?? '').replace(/[&<>"']/g, c => map[c]!);
}

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === 'string' ? v : '';
}

function num(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** ISO 时间 → 上海时区可读格式；解析失败原样返回 */
function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function layout(title: string, bodyLines: string[]): string {
  return `
  <div style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>${htmlEscape(title)}</h2>
    ${bodyLines.map(line => `<p>${line}</p>`).join('\n    ')}
    <p style="color: #999; font-size: 12px;">本邮件由云砚直播系统自动发送，请勿直接回复。</p>
  </div>
  `;
}

/**
 * F9 模板层：kind → {subject, html}。纯函数便于单测；
 * 新增 kind 须同步 NOTIFY_KINDS 白名单与 docs/research/notification-matrix.md。
 */
export function renderNotify(
  kind: NotifyKind,
  payload: Record<string, unknown>
): { subject: string; html: string } {
  switch (kind) {
    case 'class_reminder': {
      const title = str(payload, 'title') || '直播课';
      const startTime = formatTime(str(payload, 'startTime'));
      return {
        subject: `云砚直播 - 开课提醒：${title}`,
        html: layout('开课提醒', [
          `您的课程《${htmlEscape(title)}》${startTime ? `将于 <b>${htmlEscape(startTime)}</b>` : '即将'} 开始，请提前进入教室。`
        ])
      };
    }
    case 'recording_ready': {
      const recordingId = htmlEscape(str(payload, 'recordingId') || '');
      const roomId = htmlEscape(str(payload, 'roomId') || '');
      return {
        subject: '云砚直播 - 录制已就绪',
        html: layout('录制已就绪', [
          `录制 <code>${recordingId}</code>${roomId ? `（房间 ${roomId}）` : ''} 已完成转码，可前往观看或下载。`
        ])
      };
    }
    case 'checkin_ended': {
      const signed = num(payload, 'signedCount');
      const roomId = htmlEscape(str(payload, 'roomId') || '');
      return {
        subject: `云砚直播 - 签到结束：${signed} 人已签到`,
        html: layout('签到已结束', [
          `${roomId ? `房间 ${roomId} 的` : ''}签到已结束，共 <b>${signed}</b> 人签到。`
        ])
      };
    }
    default: {
      // NOTIFY_KINDS 白名单在上游已挡；防御分支防新增 kind 漏实现
      throw new Error(`未知通知类型: ${String(kind)}`);
    }
  }
}
