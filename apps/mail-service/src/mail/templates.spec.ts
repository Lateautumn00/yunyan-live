import { describe, expect, it } from 'vitest';
import { htmlEscape, renderNotify } from './templates';

describe('renderNotify（F9 模板层）', () => {
  it('class_reminder：主题含课程名，正文含上海时区时间', () => {
    const r = renderNotify('class_reminder', {
      title: '初二数学',
      startTime: '2026-10-20T02:00:00.000Z' // UTC → 10:00 Asia/Shanghai
    });
    expect(r.subject).toBe('云砚直播 - 开课提醒：初二数学');
    expect(r.html).toContain('初二数学');
    expect(r.html).toContain('2026/10/20 10:00:00');
  });

  it('recording_ready：主题固定，正文含录制 id 与房间', () => {
    const r = renderNotify('recording_ready', { recordingId: 'abc123', roomId: 'r9' });
    expect(r.subject).toBe('云砚直播 - 录制已就绪');
    expect(r.html).toContain('abc123');
    expect(r.html).toContain('r9');
  });

  it('checkin_ended：主题与正文含签到人数', () => {
    const r = renderNotify('checkin_ended', { roomId: 'r1', signedCount: 17 });
    expect(r.subject).toBe('云砚直播 - 签到结束：17 人已签到');
    expect(r.html).toContain('17');
  });

  it('缺字段回退：title/startTime 缺省不产生 undefined 文本', () => {
    const r = renderNotify('class_reminder', {});
    expect(r.subject).toBe('云砚直播 - 开课提醒：直播课');
    expect(r.html).not.toContain('undefined');
    const b = renderNotify('recording_ready', {});
    expect(b.html).not.toContain('undefined');
  });

  it('title 含 HTML 元素被转义（防注入）', () => {
    const r = renderNotify('class_reminder', { title: '<script>alert(1)</script>' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(htmlEscape(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;');
  });

  it('未知 kind 抛错（防御分支）', () => {
    expect(() => renderNotify('marketing' as never, {})).toThrow('未知通知类型');
  });
});
