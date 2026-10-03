export function formatDate(time: number, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!time) {
    return '';
  }
  const d = new Date(time);
  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: formateNumber(d.getMonth() + 1),
    DD: formateNumber(d.getDate()),
    HH: formateNumber(d.getHours()),
    mm: formateNumber(d.getMinutes()),
    ss: formateNumber(d.getSeconds())
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, token => tokens[token] ?? token);
}

export function formateNumber(num: number): string {
  const str = num.toString();
  return str[1] ? str : `0${str}`;
}

/** 秒数 → 秒表样式 `03'07"`（不足 10 分/秒补零） */
export function formatStopwatch(time: number | undefined): string {
  if (!time || time <= 0) return `00'00"`;
  const minute = Math.floor(time / 60);
  const second = time % 60;
  return `${formateNumber(minute)}'${formateNumber(second)}"`;
}

/** 秒数 → 中文时长 `6分30秒` / `45秒` / `0秒` */
export function formatDurationCn(seconds: number): string {
  if (!seconds || seconds < 1) return '0秒';
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

/** 秒数 → 时钟样式 `06:30`（非法值返回空串） */
export function formatDurationClock(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

/** 字节数 → `512B` / `1.0KB` / `2.5MB` */
export function formatFileSize(size: number): string {
  const n = Number(size) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1048576).toFixed(1)}MB`;
}

/** 时间戳 → `2020-09-13 上午 20:26:40`（沿用既有文案：24 小时制 + 上午/下午） */
export function formatCnDateTime(time: number): string {
  const ts = Number(time);
  const day = formatDate(ts, 'YYYY-MM-DD');
  const times = formatDate(ts, 'HH:mm:ss');
  const period = new Date(ts).getHours() < 12 ? '上午' : '下午';
  return `${day} ${period} ${times}`;
}
