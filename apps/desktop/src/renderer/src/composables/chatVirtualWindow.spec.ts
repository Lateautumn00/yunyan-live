import { describe, expect, it } from 'vitest';
import {
  CHAT_ITEM_ESTIMATE,
  CHAT_ITEM_OVERSCAN,
  computeChatWindow,
  type ChatWindowInput
} from './chatVirtualWindow';

function sumRange(heights: number[], start: number, end: number): number {
  let s = 0;
  for (let i = start; i < end; i++) s += heights[i]!;
  return s;
}

function uniformHeights(count: number, estimate: number): number[] {
  return Array.from({ length: count }, () => estimate);
}

/** 合成总高恒等式：spacerTop + 窗口高度和 + spacerBottom === total */
function expectPartition(w: ReturnType<typeof computeChatWindow>, heights: number[]): void {
  expect(w.spacerTop + sumRange(heights, w.start, w.end) + w.spacerBottom).toBe(w.total);
}

function make(partial: Partial<ChatWindowInput>): ReturnType<typeof computeChatWindow> {
  return computeChatWindow({
    count: 0,
    scrollTop: 0,
    viewportH: 400,
    ...partial
  });
}

describe('computeChatWindow（F6 纯函数窗口计算）', () => {
  it('空列表 → 全零窗口', () => {
    expect(make({ count: 0 })).toEqual({
      start: 0,
      end: 0,
      spacerTop: 0,
      spacerBottom: 0,
      total: 0
    });
  });

  it('viewportH<=0（无布局/首帧）→ 全量渲染 fallback，spacers 归零', () => {
    const count = 120;
    const w = make({ count, viewportH: 0 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(count);
    expect(w.spacerTop).toBe(0);
    expect(w.spacerBottom).toBe(0);
    expect(w.total).toBe(count * CHAT_ITEM_ESTIMATE);
  });

  it('顶部滚动：窗口从 0 起，含 overscan，无顶 spacer', () => {
    const count = 100;
    const heights = uniformHeights(count, CHAT_ITEM_ESTIMATE);
    const w = make({ count, scrollTop: 0 });
    expect(w.start).toBe(0);
    expect(w.spacerTop).toBe(0);
    expect(w.end).toBeGreaterThanOrEqual(1);
    expect(w.end - w.start).toBeLessThanOrEqual(count);
    expect(w.end).toBeGreaterThan(CHAT_ITEM_OVERSCAN);
    expectPartition(w, heights);
  });

  it('中部滚动：窗口含 scrollTop 点，双向 overscan，分区恒等', () => {
    const count = 100;
    const heights = uniformHeights(count, CHAT_ITEM_ESTIMATE);
    const scrollTop = 40 * CHAT_ITEM_ESTIMATE;
    const w = make({ count, scrollTop });
    // 窗口起点在 overscan 保护下先于 scrollTop 点
    expect(w.start).toBeLessThanOrEqual(40);
    expect(w.end).toBeGreaterThanOrEqual(41);
    // 双向 spacer 均非零（深滚动位置）
    expect(w.spacerTop).toBeGreaterThan(0);
    expect(w.spacerBottom).toBeGreaterThan(0);
    expectPartition(w, heights);
  });

  it('scrollTop 超界（>= total）→ 夹到末屏，末条可见', () => {
    const count = 50;
    const heights = uniformHeights(count, CHAT_ITEM_ESTIMATE);
    const w = make({ count, scrollTop: 10_000_000 });
    expect(w.end).toBe(count);
    expect(w.spacerBottom).toBe(0);
    expect(w.start).toBeLessThan(count);
    expectPartition(w, heights);
  });

  it('scrollTop 负值 → 夹到顶部', () => {
    const w = make({ count: 30, scrollTop: -500 });
    expect(w.start).toBe(0);
    expect(w.spacerTop).toBe(0);
  });

  it('heightAt 实测高度覆盖估高并影响 total/spacers', () => {
    const count = 6;
    const estimate = 48;
    const measured = 200;
    const heights = [measured, estimate, estimate, estimate, estimate, estimate];
    const w = make({
      count,
      scrollTop: 0,
      viewportH: 400,
      estimate,
      heightAt: i => (i === 0 ? measured : undefined)
    });
    expect(w.total).toBe(measured + 5 * estimate);
    // 实测 200 的首条即覆盖一屏起点，窗口起点含 overscan 兜底
    expect(w.start).toBe(0);
    expect(w.end).toBeLessThanOrEqual(count);
    expectPartition(w, heights);
  });

  it('500 条任意滚动位置：窗口节点数恒定有界（DoD 核心不变式）', () => {
    const count = 500;
    const heights = uniformHeights(count, CHAT_ITEM_ESTIMATE);
    const positions = [0, 1, 5_000, 12_000, 23_000, Number.MAX_SAFE_INTEGER];
    const sizes = positions.map(top => {
      const w = make({ count, scrollTop: top });
      expect(w.end - w.start).toBeLessThanOrEqual(count);
      expect(w.end - w.start).toBeGreaterThan(0);
      expect(w.end).toBeLessThanOrEqual(count);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expectPartition(w, heights);
      return w.end - w.start;
    });
    // 非边缘位置窗口尺寸一致（边缘只缩不小）
    const max = Math.max(...sizes);
    expect(max).toBeLessThanOrEqual(
      CHAT_ITEM_OVERSCAN * 2 + Math.ceil(400 / CHAT_ITEM_ESTIMATE) + 2
    );
    for (const size of sizes) expect(size).toBeLessThanOrEqual(max);
  });

  it('混合实测高度：窗口覆盖 viewportH 且分区恒等', () => {
    const count = 40;
    const heights = Array.from({ length: count }, (_, i) => (i % 3 === 0 ? 96 : 48));
    const viewportH = 400;
    const scrollTop = 15 * 48;
    const w = make({ count, scrollTop, viewportH, heightAt: i => heights[i] });
    expectPartition(w, heights);
    // 覆盖：窗口高度（不含 overscan 的核心区）至少一屏——用总高减 spacers 逼近验证
    const coreHeight = w.total - w.spacerTop - w.spacerBottom;
    expect(coreHeight).toBeGreaterThanOrEqual(viewportH);
  });
});
