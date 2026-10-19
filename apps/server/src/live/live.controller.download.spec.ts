import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import type { Response } from 'express';
import { of } from 'rxjs';
import { LiveController } from './live.controller';

/** 允许缺省 download query 参数 */
const q = (s?: string) => s as string;

const h = vi.hoisted(() => ({
  present: new Set<string>(),
  written: [] as string[],
  reads: [] as string[],
  piped: [] as unknown[],
  removed: [] as string[],
  spawns: [] as Array<{ file: string; args: string[]; opts: { stdio?: string } }>,
  statSize: 4096,
  spawnExit: 0
}));

vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: string) => h.present.has(p),
    statSync: () => ({ size: h.statSize }),
    writeFileSync: (p: string) => {
      h.written.push(p);
    },
    rmSync: (p: string) => {
      h.removed.push(p);
      h.present.delete(p);
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

vi.mock('child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('child_process')>();
  const { EventEmitter } = await import('node:events');
  return {
    ...actual,
    spawn: (file: string, args: string[], opts: { stdio?: string }) => {
      h.spawns.push({ file, args, opts });
      const child = new EventEmitter() as ReturnType<typeof actual.spawn>;
      queueMicrotask(() => child.emit('close', h.spawnExit));
      return child;
    }
  };
});

function createController() {
  const liveService = {
    // S4 归属断言：recording id → room；默认 room=r1（房主 t1）
    getVideoRoomMap: vi.fn(() =>
      of({
        code: '0',
        msg: 'ok',
        data: { items: [{ video_id: '1', room_id: 'r1' }] }
      })
    ),
    showRoom: vi.fn(() =>
      of({
        code: '0',
        msg: 'ok',
        data: { room_id: 'r1', live_user_id: 't1' }
      })
    )
  };
  const audit = { publish: vi.fn() };
  const notify = { publish: vi.fn() };
  const controller = new LiveController(
    { getService: vi.fn(() => liveService) } as never,
    { getService: vi.fn(() => ({})) } as never,
    audit as never,
    notify as never
  );
  controller.onModuleInit();
  return { controller, liveService, audit, notify };
}

const reqRole = (userId: string, role: number, email?: string) => ({
  user: { userId, role, ...(email ? { email } : {}) }
});

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
  h.removed.length = 0;
  h.spawns.length = 0;
  h.spawnExit = 0;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('downloadRecording 状态探测', () => {
  it('video mjr 缺失返回 404 且不触发转码', async () => {
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 404, msg: '录制文件不存在' });
    expect(h.spawns).toHaveLength(0);
    expect(h.written).toHaveLength(0);
  });

  it('download=true 且 mp4 未生成返回转码中', async () => {
    h.present.add(videoMjr('1'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', 'true', res as unknown as Response, reqRole('t1', 1));
    expect(res.json).toHaveBeenCalledWith({ code: 2002, msg: '转码中，请稍后' });
    expect(res.set).not.toHaveBeenCalled();
  });

  it('download=true 且 mp4 就绪时设置响应头并流式输出', async () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const { controller, audit } = createController();
    const res = createRes();
    await controller.downloadRecording('1', 'true', res as unknown as Response, reqRole('t1', 1));
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'video/mp4',
      'Content-Length': '4096',
      'Content-Disposition': 'attachment; filename="1.mp4"'
    });
    expect(h.reads).toEqual([mp4('1')]);
    expect(h.piped).toEqual([res]);
    expect(res.json).not.toHaveBeenCalled();
    expect(h.spawns).toHaveLength(0);
    // S12：导出记录点（真实下载流，detail 只留 roomId/bytes）
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 't1',
        action: 'recording.export',
        targetType: 'recording',
        targetId: '1',
        detail: { roomId: 'r1', bytes: 4096 }
      })
    );
  });

  it('非 download 且 mp4 已就绪返回转码完成', async () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    expect(res.json).toHaveBeenCalledWith({ code: 1000, msg: '转码完成' });
    expect(h.spawns).toHaveLength(0);
  });

  it('存在 converting 标记返回转码中且不重复触发', async () => {
    h.present.add(videoMjr('1'));
    h.present.add(marker('1'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    expect(res.json).toHaveBeenCalledWith({ code: 2002, msg: '转码中，请稍后' });
    expect(h.written).toHaveLength(0);
    expect(h.spawns).toHaveLength(0);
  });

  it('download 非 true 的其它取值按状态探测处理', async () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', 'false', res as unknown as Response, reqRole('t1', 1));
    expect(res.json).toHaveBeenCalledWith({ code: 1000, msg: '转码完成' });
  });
});

describe('downloadRecording 转码触发', () => {
  const C = 'janus-gateway';
  const PP = '/opt/janus/bin/janus-pp-rec';

  it('无音轨时写标记并 spawn 3 次 docker exec（数组传参，不经 shell）', async () => {
    h.present.add(videoMjr('1'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    // 等待 fire-and-forget 的 transcodeRecording 走完 exec 链
    await new Promise(r => setTimeout(r, 0));

    expect(h.written).toEqual([marker('1')]);
    expect(h.spawns).toHaveLength(3);
    for (const s of h.spawns) {
      expect(s.file).toBe('docker');
      expect(s.args[0]).toBe('exec');
      expect(s.args[1]).toBe(C);
      expect(s.opts).toEqual({ stdio: 'ignore' });
    }
    expect(h.spawns[0]?.args).toEqual([
      'exec',
      C,
      PP,
      '/tmp/janus/recordings/rec-1-video.mjr',
      '/tmp/janus/recordings/1-video.webm'
    ]);
    expect(h.spawns[1]?.args).toEqual([
      'exec',
      C,
      'ffmpeg',
      '-y',
      '-i',
      '/tmp/janus/recordings/1-video.webm',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '/tmp/janus/recordings/1.mp4'
    ]);
    expect(h.spawns[2]?.args).toEqual([
      'exec',
      C,
      'rm',
      '-f',
      '/tmp/janus/recordings/1-video.webm'
    ]);
    // marker 在 finally 中被清理，保证失败可重试
    expect(h.removed).toEqual([marker('1')]);
    expect(res.json).toHaveBeenCalledWith({ code: 2002, msg: '转码中，请稍后' });
  });

  it('有音轨时追加 opus 提取、混流与清理步骤（共 4 次 docker exec）', async () => {
    h.present.add(videoMjr('1'));
    h.present.add(audioMjr('1'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    await vi.waitFor(() => expect(h.spawns).toHaveLength(4));
    expect(h.spawns[0]?.args).toEqual([
      'exec',
      C,
      PP,
      '/tmp/janus/recordings/rec-1-video.mjr',
      '/tmp/janus/recordings/1-video.webm'
    ]);
    expect(h.spawns[1]?.args).toEqual([
      'exec',
      C,
      PP,
      '/tmp/janus/recordings/rec-1-audio.mjr',
      '/tmp/janus/recordings/1-audio.opus'
    ]);
    expect(h.spawns[2]?.args).toEqual([
      'exec',
      C,
      'ffmpeg',
      '-y',
      '-i',
      '/tmp/janus/recordings/1-video.webm',
      '-i',
      '/tmp/janus/recordings/1-audio.opus',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '/tmp/janus/recordings/1.mp4'
    ]);
    expect(h.spawns[3]?.args).toEqual([
      'exec',
      C,
      'rm',
      '-f',
      '/tmp/janus/recordings/1-video.webm',
      '/tmp/janus/recordings/1-audio.opus'
    ]);
    expect(h.removed).toEqual([marker('1')]);
  });

  it('容器与转换器可用环境变量覆盖', async () => {
    process.env.RECORDINGS_DIR = 'D:\\rec';
    process.env.JANUS_CONTAINER = 'janus-prod';
    process.env.JANUS_PP_REC = '/opt/custom/janus-pp-rec';
    h.present.add(path.join('D:\\rec', 'rec-9-video.mjr'));
    const { controller } = createController();
    const res = createRes();
    await controller.downloadRecording('9', q(), res as unknown as Response, reqRole('t1', 1));
    await new Promise(r => setTimeout(r, 0));

    expect(h.written).toEqual([path.join('D:\\rec', '9.converting')]);
    expect(h.spawns[0]?.args).toEqual([
      'exec',
      'janus-prod',
      '/opt/custom/janus-pp-rec',
      '/tmp/janus/recordings/rec-9-video.mjr',
      '/tmp/janus/recordings/9-video.webm'
    ]);
    expect(h.removed).toEqual([path.join('D:\\rec', '9.converting')]);
  });

  it('拒绝路径穿越与命令注入元字符的录制 id（不触碰 fs/spawn）', async () => {
    const { controller } = createController();
    const res = createRes();
    for (const bad of ['../etc/passwd', 'a b', '$(whoami)', 'a"b', 'a;rm -rf /']) {
      await controller.downloadRecording(bad, q(), res as unknown as Response, reqRole('t1', 1));
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ code: 400, msg: '非法录制 id' });
    }
    expect(h.spawns).toHaveLength(0);
    expect(h.written).toHaveLength(0);
  });
});

describe('downloadRecording F9 录制完成通知', () => {
  it('转码成功且有邮箱 → 发布 recording_ready（收件人=操作者邮箱，scope=rec-id）', async () => {
    h.present.add(videoMjr('1'));
    const { controller, notify } = createController();
    const res = createRes();
    await controller.downloadRecording(
      '1',
      q(),
      res as unknown as Response,
      reqRole('t1', 1, 'teacher@example.com')
    );
    await new Promise(r => setTimeout(r, 0));

    expect(notify.publish).toHaveBeenCalledTimes(1);
    expect(notify.publish).toHaveBeenCalledWith({
      kind: 'recording_ready',
      to: 'teacher@example.com',
      scope: 'rec-1',
      payload: { recordingId: '1', roomId: 'r1' }
    });
  });

  it('无邮箱（老 token）→ 不发布通知，转码照常', async () => {
    h.present.add(videoMjr('1'));
    const { controller, notify } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    await new Promise(r => setTimeout(r, 0));

    expect(notify.publish).not.toHaveBeenCalled();
    expect(h.spawns).toHaveLength(3);
  });

  it('转码失败（docker exec 非 0）→ 不发布通知，marker 照常清理', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.present.add(videoMjr('1'));
    h.spawnExit = 1;
    const { controller, notify } = createController();
    const res = createRes();
    await controller.downloadRecording(
      '1',
      q(),
      res as unknown as Response,
      reqRole('t1', 1, 'teacher@example.com')
    );
    await new Promise(r => setTimeout(r, 0));

    expect(notify.publish).not.toHaveBeenCalled();
    // 失败清理的是容器内 mp4 路径（catch 内 rmSync containerMp4），marker 随 finally 清理
    expect(h.removed).toEqual(['/tmp/janus/recordings/1.mp4', marker('1')]);
    expect(errSpy).toHaveBeenCalledWith('[live] recording transcode failed:', expect.any(Error));
    errSpy.mockRestore();
  });

  it('已就绪 mp4 直接返回（download 状态探测）不重复发布', async () => {
    h.present.add(videoMjr('1'));
    h.present.add(mp4('1'));
    const { controller, notify } = createController();
    const res = createRes();
    await controller.downloadRecording('1', q(), res as unknown as Response, reqRole('t1', 1));
    expect(res.json).toHaveBeenCalledWith({ code: 1000, msg: '转码完成' });
    expect(notify.publish).not.toHaveBeenCalled();
  });
});
