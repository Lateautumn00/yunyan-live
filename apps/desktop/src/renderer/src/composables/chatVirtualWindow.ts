/**
 * F6 聊天列表虚拟窗口（自研零依赖，批次 4b 拍板）：
 * - 纯函数窗口计算：估高 + 实测缓存（heightAt 回调）+ 双向 overscan
 * - viewportH <= 0（jsdom 无布局/首帧未测）→ 全量渲染 fallback
 * - spacer 走 ul 的 padding-top/bottom（不产占位 li，消息 li 计数恒等于窗口内消息数）
 * - total 为合成总高，供滚动锚点/吸底在无布局环境稳定计算
 */

/** 单条消息估高（px）：实测缓存未命中时使用；典型 = 4 padding + 36 line + 8 user 区 */
export const CHAT_ITEM_ESTIMATE = 48;
/** 窗口上下各多渲染的条数，滚动/插入防露白 */
export const CHAT_ITEM_OVERSCAN = 8;

export interface ChatWindowInput {
  count: number;
  scrollTop: number;
  /** <= 0 视为无布局环境（jsdom/首帧）→ 全量渲染 */
  viewportH: number;
  estimate?: number;
  overscan?: number;
  /** 返回该下标消息的实测高度；缺省/非正数回落 estimate */
  heightAt?: (index: number) => number | undefined;
}

export interface ChatWindow {
  /** 渲染起点（含 overscan，闭区间） */
  start: number;
  /** 渲染终点（不含） */
  end: number;
  spacerTop: number;
  spacerBottom: number;
  /** 合成总高 = spacerTop + 窗口高度和 + spacerBottom */
  total: number;
}

export function computeChatWindow(input: ChatWindowInput): ChatWindow {
  const { count, scrollTop, viewportH } = input;
  const estimate = input.estimate && input.estimate > 0 ? input.estimate : CHAT_ITEM_ESTIMATE;
  const overscan = Math.max(0, input.overscan ?? CHAT_ITEM_OVERSCAN);
  if (count <= 0) {
    return { start: 0, end: 0, spacerTop: 0, spacerBottom: 0, total: 0 };
  }
  const heights = new Array<number>(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const measured = input.heightAt?.(i);
    const h = measured !== undefined && measured > 0 ? measured : estimate;
    heights[i] = h;
    total += h;
  }
  if (viewportH <= 0) {
    return { start: 0, end: count, spacerTop: 0, spacerBottom: 0, total };
  }
  const top = Math.min(Math.max(scrollTop, 0), Math.max(total - viewportH, 0));
  let start = 0;
  let acc = 0;
  while (start < count && acc + heights[start]! <= top) {
    acc += heights[start]!;
    start++;
  }
  let end = start;
  const bottom = top + viewportH;
  while (end < count && acc < bottom) {
    acc += heights[end]!;
    end++;
  }
  const winStart = Math.max(0, start - overscan);
  const winEnd = Math.min(count, end + overscan);
  let spacerTop = 0;
  for (let i = 0; i < winStart; i++) spacerTop += heights[i]!;
  let spacerBottom = 0;
  for (let i = winEnd; i < count; i++) spacerBottom += heights[i]!;
  return { start: winStart, end: winEnd, spacerTop, spacerBottom, total };
}
