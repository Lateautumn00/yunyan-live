import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MediaOverlay from './MediaOverlay.vue';
import { MEDIA_PROGRESS_MS } from './whiteboard/media';
import type { MediaProgressState } from './whiteboard/types';

// F5.3-B 播放状态同步：组件白盒（注入假控制器，jsdom 无真实播放）
type Ctl = { play(): void; pause(): void; seek(s: number): void; time(): number; destroy(): void };

function makeCtl() {
  const calls: string[] = [];
  let t = 0;
  const ctl: Ctl = {
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seek: s => {
      t = s;
      calls.push(`seek:${s}`);
    },
    time: () => t,
    destroy: () => calls.push('destroy')
  };
  return { calls, ctl, setT: (n: number) => (t = n) };
}

function baseEl(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    type: 'media',
    srcKind: 'url',
    src: 'https://cdn.test/v.mp4',
    name: 'v.mp4',
    mime: 'video',
    playing: false,
    time: 0,
    loop: false,
    ended: false,
    x: 0,
    y: 0,
    width: 480,
    height: 270,
    ...over
  };
}

function mountO(opts: {
  el: Record<string, unknown>;
  isTeacher?: boolean;
  remote?: MediaProgressState | null;
  ctl: Ctl;
}) {
  return mount(MediaOverlay, {
    props: {
      el: opts.el,
      isTeacher: opts.isTeacher ?? true,
      remote: opts.remote ?? null,
      createCtl: () => opts.ctl
    }
  });
}

describe('F5.3-B MediaOverlay 播放状态同步', () => {
  it('正向：教师播放/暂停 → emit state（带当前时间），离散态驱动控制器，unmount 销毁', async () => {
    const f = makeCtl();
    const el = baseEl();
    const w = mountO({ el, ctl: f.ctl });

    expect(w.find('.mo-play').exists()).toBe(true);
    await w.find('.mo-play').trigger('click');
    expect(w.emitted('state')![0]).toEqual([{ elId: 'm1', playing: true, time: 0 }]);

    // 模拟父级把离散态写回 Yjs → refreshLayer 换新对象（生产同路径）→ 控制器 play + 播放态类
    el.playing = true;
    await w.setProps({ el: { ...el } });
    expect(f.calls).toContain('play');
    expect(w.find('.media-overlay').classes()).toContain('is-playing');

    f.setT(12.5);
    await w.find('.mo-play').trigger('click');
    expect(w.emitted('state')![1]).toEqual([{ elId: 'm1', playing: false, time: 12.5 }]);
    el.playing = false;
    el.time = 12.5;
    await w.setProps({ el: { ...el } });
    expect(f.calls).toContain('pause');

    w.unmount();
    expect(f.calls).toContain('destroy');
  });

  it('正向：起播 seek 断点在 play 前；远端进度漂移 >400ms 回拉；elId 不匹配与断线零动作', async () => {
    const f = makeCtl();
    const el = baseEl({ playing: true, time: 5 });
    const w = mountO({ el, isTeacher: false, ctl: f.ctl });

    // 学生端无控制条
    expect(w.find('.mo-play').exists()).toBe(false);
    // 离散态起播：先 seek 断点再 play
    expect(f.calls).toEqual(['seek:5', 'play']);

    // 远端进度广播（elId 匹配）：0s 当前 vs 目标 6s → 漂移回拉
    const remote: MediaProgressState = {
      userId: 'teacher-x',
      elId: 'm1',
      playing: true,
      time: 6,
      rate: 1,
      ts: Date.now()
    };
    await w.setProps({ remote });
    expect(f.calls).toContain('seek:6');

    // 断线（null）→ 不追加动作、不崩
    await w.setProps({ remote: null });
    const n = f.calls.length;
    // 其他元素的广播 → 忽略
    await w.setProps({ remote: { ...remote, elId: 'other' } });
    expect(f.calls.length).toBe(n);
    w.unmount();
  });

  it('正向：教师进度按 MEDIA_PROGRESS_MS 节流广播', () => {
    vi.useFakeTimers();
    try {
      const f = makeCtl();
      const el = baseEl({ playing: true });
      const w = mountO({ el, isTeacher: true, ctl: f.ctl });
      expect(f.calls).toContain('play');

      f.setT(4);
      vi.advanceTimersByTime(MEDIA_PROGRESS_MS);
      expect(w.emitted('progress')![0]).toEqual([{ elId: 'm1', time: 4 }]);
      f.setT(6);
      vi.advanceTimersByTime(MEDIA_PROGRESS_MS);
      expect(w.emitted('progress')![1]).toEqual([{ elId: 'm1', time: 6 }]);
      w.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('负向：本地文件学生端占位（不可播、无控制条、不建控制器）', () => {
    const f = makeCtl();
    const el = baseEl({ srcKind: 'local', src: 'C:/app/media/u1-a.mp4' });
    const w = mountO({ el, isTeacher: false, ctl: f.ctl });
    expect(w.find('.mo-unavailable').exists()).toBe(true);
    expect(w.find('video').exists()).toBe(false);
    expect(w.find('.mo-play').exists()).toBe(false);
    expect(f.calls).toHaveLength(0);
    w.unmount();
  });

  it('负向：URL 加载失败 → 错误占位（停止进度广播）', async () => {
    const f = makeCtl();
    const el = baseEl({ playing: true });
    const w = mountO({ el, ctl: f.ctl });
    expect(w.find('video').exists()).toBe(true);
    await w.find('video').trigger('error');
    expect(w.find('.mo-error').exists()).toBe(true);
    w.unmount();
  });

  it('正向：时长 ≥1h 显示超长提示', async () => {
    const w = mountO({ el: baseEl(), ctl: makeCtl().ctl });
    const videoEl = w.find('video').element as HTMLMediaElement;
    Object.defineProperty(videoEl, 'duration', { value: 4000, configurable: true });
    videoEl.dispatchEvent(new Event('loadedmetadata'));
    await w.vm.$nextTick();
    expect(w.find('.mo-long').exists()).toBe(true);
    w.unmount();
  });
});
