import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import type { Response } from 'express';
import { LiveController } from './live.controller';

/** 允许缺省 download query 参数 */
const q = (s?: string) => s as string;

const h = vi.hoisted(() => ({
  present: new Set<string>(),
  written: [] as string[],
  reads: [] as string[],
  piped: [] as unknown[],
  spawns: [] as Array<{ file: string; args: string[]; opts: { detached?: boolean; stdio?: string } }>,
  unref: 0,
  statSize: 4096
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: string) => h.present.has(p),
    statSync: () => ({ size: h.statSize }),
    writeFileSync: (p: string) => {
      h.written.push(p);
    },
    createReadStream: (p: string) => {
      h.reads.push(p);
      return {
        pipe: (target: unknown) => {
          h.piped.push(target);
          return target;
        }
      } as unknown as ReturnType<typeof actual.createReadStream>;
    }
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (file: string, args: string[], opts: { detached?: boolean; stdio?: string }) => {
      h.spawns.push({ file, args, opts });
      return { unref: () => { h.unref += 1; } };
    }
  };
});

function createController() {
  return new LiveController(
    { getService: vi.fn(() => ({})) } as never,
    { getService: vi.fn(() => ({})) } as never
  );
}

function createRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    set: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.set.mockReturnValue(res);
  return res;
}

const DIR = process.env.RECORDINGS_DIR || '/home/janus/recordings';
const videoMjr = (id: string) => path.join(DIR, `rec-${id}-video.mjr`);
const audioMjr = (id: string) => path.join(DIR, `rec-${id}-audio.mjr`);
const mp4 = (id: string) => path.join(DIR, `${id}.mp4`);
const marker = (id: string) => path.join(DIR, `${id}.converting`);

const originalEnv = { ...process.env };

beforeEach(() => {
  h.present.clear();
  h.written.length = 0;
  h.reads.length = 0;
  h.piped.length = 0;
  h.spawns.length = 0;
  h.unref = 0;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('downloadRecording 状态探测', () => {
  it('video mjr 缺失返回 404 且不触发转码', () => {
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', q(), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 404, msg: '录制文件不存在' });
    expect(h.spawns).toHaveLength(0);
    expect(h.written).toHaveLength(0);
  });

  it('download=true 且 mp4 未生成返回转码中', () => {
    h.present.add(videoMjr('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', 'true', res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith({ code: 2002, msg: '转码中，请稍后' });
    expect(res.set).not.toHaveBeenCalled();
  });

  it('download=true 且 mp4 就绪时设置响应头并流式输出', () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', 'true', res as unknown as Response);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'video/mp4',
      'Content-Length': '4096',
      'Content-Disposition': 'attachment; filename="1.mp4"'
    });
    expect(h.reads).toEqual([mp4('1')]);
    expect(h.piped).toEqual([res]);
    expect(res.json).not.toHaveBeenCalled();
    expect(h.spawns).toHaveLength(0);
  });

  it('非 download 且 mp4 已就绪返回转码完成', () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', q(), res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith({ code: 1000, msg: '转码完成' });
    expect(h.spawns).toHaveLength(0);
  });

  it('存在 converting 标记返回转码中且不重复触发', () => {
    h.present.add(videoMjr('1'));
    h.present.add(marker('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', q(), res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith({ code: 2002, msg: '转码中，请稍后' });
    expect(h.written).toHaveLength(0);
    expect(h.spawns).toHaveLength(0);
  });

  it('download 非 true 的其它取值按状态探测处理', () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', 'false', res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith({ code: 1000, msg: '转码完成' });
  });
});

describe('downloadRecording 转码触发', () => {
  it('无音轨时写标记并 spawn 双步转码脚本', () => {
    h.present.add(videoMjr('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', q(), res as unknown as Response);

    expect(h.written).toEqual([marker('1')]);
    expect(h.spawns).toHaveLength(1);
    const spawn = h.spawns[0];
    expect(spawn?.file).toBe('sh');
    expect(spawn?.opts).toEqual({ detached: true, stdio: 'ignore' });
    expect(spawn?.args[0]).toBe('-c');
    expect(h.unref).toBe(1);
    expect(res.json).toHaveBeenCalledWith({ code: 2002, msg: '转码中，请稍后' });

    const script = spawn?.args[1] ?? '';
    expect(script).toContain('docker exec janus-gateway /opt/janus/bin/janus-pp-rec');
    expect(script).toContain('"/tmp/janus/recordings/rec-1-video.mjr" "/tmp/janus/recordings/1-video.webm"');
    expect(script).toContain(
      'docker exec janus-gateway ffmpeg -y -i "/tmp/janus/recordings/1-video.webm" -c:v libx264 -preset ultrafast "/tmp/janus/recordings/1.mp4"'
    );
    expect(script).not.toContain('1-audio.opus');
    expect(script).toContain(`rm -f "${marker('1')}"`);
    expect(script.split(' && ')).toHaveLength(4);
  });

  it('有音轨时追加 opus 提取、混流与清理步骤', () => {
    h.present.add(videoMjr('1'));
    h.present.add(audioMjr('1'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('1', q(), res as unknown as Response);

    const script = h.spawns[0]?.args[1] ?? '';
    expect(script).toContain(
      'docker exec janus-gateway /opt/janus/bin/janus-pp-rec "/tmp/janus/recordings/rec-1-audio.mjr" "/tmp/janus/recordings/1-audio.opus"'
    );
    expect(script).toContain(
      'ffmpeg -y -i "/tmp/janus/recordings/1-video.webm" -i "/tmp/janus/recordings/1-audio.opus" -c:v libx264 -preset ultrafast -c:a aac "/tmp/janus/recordings/1.mp4"'
    );
    expect(script).toContain('rm -f "/tmp/janus/recordings/1-video.webm" "/tmp/janus/recordings/1-audio.opus"');
    expect(script.split(' && ')).toHaveLength(5);
  });

  it('容器、转换器与录制目录可用环境变量覆盖', () => {
    process.env.RECORDINGS_DIR = 'D:\\rec';
    process.env.JANUS_CONTAINER = 'janus-prod';
    process.env.JANUS_PP_REC = '/opt/custom/janus-pp-rec';
    h.present.add(path.join('D:\\rec', 'rec-9-video.mjr'));
    const controller = createController();
    const res = createRes();
    void controller.downloadRecording('9', q(), res as unknown as Response);

    expect(h.written).toEqual([path.join('D:\\rec', '9.converting')]);
    const script = h.spawns[0]?.args[1] ?? '';
    expect(script).toContain('docker exec janus-prod /opt/custom/janus-pp-rec "/tmp/janus/recordings/rec-9-video.mjr"');
    expect(script).toContain(`rm -f "${path.join('D:\\rec', '9.converting')}"`);
  });
});
