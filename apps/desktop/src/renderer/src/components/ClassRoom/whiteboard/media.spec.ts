import { describe, expect, it } from 'vitest';
import {
  MEDIA_DRIFT_MS,
  MEDIA_LONG_SEC,
  MEDIA_PROGRESS_MS,
  driftSeekTo,
  isLongDuration,
  mediaDefaults,
  mediaHostLabel,
  mediaOverlayRect,
  mediaSize,
  pageToStage,
  playPosFrom,
  resolveMediaSrc
} from './media';
import { isElementType } from './types';

// F5.3 多媒体嵌入：模块合同（对齐公式 / 播放推算 / src 解析 / 元素默认值）

describe('F5.3 media 模块合同', () => {
  it('正向：尺寸默认 / pageToStage 与 overlay 矩形公式（含缩放平移）', () => {
    expect(mediaSize('video')).toEqual({ width: 480, height: 270 });
    expect(mediaSize('audio')).toEqual({ width: 320, height: 64 });

    // stage 恒等：屏幕 = layer.x + 页坐标 × scale
    expect(pageToStage({ x: 100, y: 50, scale: 1 }, 200, 300)).toEqual({ x: 300, y: 350 });
    const v = { x: -40, y: 30, scale: 2 };
    expect(pageToStage(v, 200, 300)).toEqual({ x: 360, y: 630 });

    expect(
      mediaOverlayRect({ x: 100, y: 50, scale: 1 }, { x: 200, y: 300, width: 480, height: 270 })
    ).toEqual({ left: 300, top: 350, width: 480, height: 270 });
    expect(mediaOverlayRect(v, { x: 200, y: 300, width: 480, height: 270 })).toEqual({
      left: 360,
      top: 630,
      width: 960,
      height: 540
    });
  });

  it('正向：mediaDefaults 元素合同（离散态入 Yjs）+ 标题派生', () => {
    const el = mediaDefaults({
      srcKind: 'url',
      src: 'https://cdn.example.com/lesson/listening.mp3',
      mime: 'audio',
      x: 12,
      y: 34
    });
    expect(el).toMatchObject({
      type: 'media',
      srcKind: 'url',
      src: 'https://cdn.example.com/lesson/listening.mp3',
      name: 'listening.mp3',
      mime: 'audio',
      x: 12,
      y: 34,
      width: 320,
      height: 64,
      playing: false,
      time: 0,
      loop: false,
      ended: false
    });
    const local = mediaDefaults({
      srcKind: 'local',
      src: 'C:\\Users\\me\\AppData\\media\\u1-课文朗读.mp4',
      mime: 'video',
      x: 0,
      y: 0
    });
    expect(local.name).toBe('课文朗读.mp4');
    expect(local.width).toBe(480);
    expect(mediaHostLabel('https://cdn.example.com/a.mp4', 'url')).toBe('cdn.example.com');
    expect(mediaHostLabel('not a url', 'url')).toBe('not a url');
  });

  it('正向：接收时刻本地化推算 + 漂移超阈值才 seek', () => {
    expect(MEDIA_PROGRESS_MS).toBe(2000);
    expect(MEDIA_DRIFT_MS).toBe(400);
    // 收包声明 10s，过了 2.5s → 位置 12.5s（本地钟，无跨机时钟依赖）
    expect(playPosFrom(10, 2500)).toBeCloseTo(12.5, 5);
    expect(playPosFrom(10, 2500, 2)).toBeCloseTo(15, 5);
    // 漂移 ≤400ms 不动（播放自然推进），>400ms 才回拉
    expect(driftSeekTo(12.5, 12.7)).toBeNull();
    expect(driftSeekTo(12.5, 12.9)).toBeNull();
    expect(driftSeekTo(12.5, 13.0)).toBeCloseTo(13, 5);
    expect(driftSeekTo(12.5, 14.0)).toBeCloseTo(14, 5);
    expect(driftSeekTo(14.0, 12.5)).toBeCloseTo(12.5, 5);
  });

  it('正向：resolveMediaSrc——URL 跨端可播；本地教师端带解析器可播', () => {
    expect(
      resolveMediaSrc({ srcKind: 'url', src: 'https://x.test/v.mp4' }, { isTeacher: false })
    ).toEqual({ ok: true, url: 'https://x.test/v.mp4' });
    const path = 'C:/app/media/u1-v.mp4';
    expect(
      resolveMediaSrc(
        { srcKind: 'local', src: path },
        { isTeacher: true, localUrl: p => `yy-media://${p}` }
      )
    ).toEqual({ ok: true, url: `yy-media://${path}` });
  });

  it('负向：本地学生端不可用占位 / 超长阈值边界 / media 类型已注册', () => {
    // 学生端没有本地文件 → 占位（§4.9 边界），不抛异常
    expect(
      resolveMediaSrc({ srcKind: 'local', src: '/media/a.mp4' }, { isTeacher: false })
    ).toEqual({ ok: false, reason: 'local-student' });
    // 教师端缺解析器（通道不可用）同样走占位
    expect(resolveMediaSrc({ srcKind: 'local', src: '/media/a.mp4' }, { isTeacher: true })).toEqual(
      { ok: false, reason: 'local-student' }
    );
    // 时长提示阈值 1h 边界
    expect(MEDIA_LONG_SEC).toBe(3600);
    expect(isLongDuration(3599.9)).toBe(false);
    expect(isLongDuration(3600)).toBe(true);
    // 类型注册（穷尽渲染合同的前提）
    expect(isElementType('media')).toBe(true);
    expect(isElementType('future-widget')).toBe(false);
  });
});
