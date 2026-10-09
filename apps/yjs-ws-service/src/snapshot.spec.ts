import { describe, expect, it } from 'vitest';
import { toLoadResult } from './snapshot';

describe('snapshot.toLoadResult（formatVersion 双向兼容）', () => {
  const detail = (over: Record<string, unknown> = {}) => ({
    code: '0',
    msg: 'success',
    data: {
      id: 's1',
      room_id: 'r1',
      lesson_id: '',
      format_version: 1,
      data: new Uint8Array([1, 2, 3]),
      created_at: '1704067200000',
      ...over
    }
  });

  it('v1 快照正常返回字节（老快照 × 新服务）', () => {
    const res = toLoadResult(detail());
    expect(res).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3]) });
  });

  it('format_version 缺省/0 按 v1 处理', () => {
    const res = toLoadResult(detail({ format_version: 0 }));
    expect(res).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3]) });
  });

  it('高于本服务版本（新快照 × 旧服务降级）→ ok:false 禁止覆盖', () => {
    expect(toLoadResult(detail({ format_version: 2 }))).toEqual({ ok: false });
    expect(toLoadResult(detail({ format_version: 99 }))).toEqual({ ok: false });
  });

  it('无历史/非成功信封 → ok:true + 空（可新建空文档）', () => {
    expect(toLoadResult(null)).toEqual({ ok: true, bytes: null });
    expect(toLoadResult(undefined)).toEqual({ ok: true, bytes: null });
    expect(toLoadResult({ code: '1', msg: 'fail' })).toEqual({ ok: true, bytes: null });
    expect(toLoadResult({ code: '0', msg: 'success' })).toEqual({ ok: true, bytes: null });
  });

  it('成功信封但 data 为空字节 → ok:true + null', () => {
    const res = toLoadResult(detail({ data: undefined }));
    expect(res).toEqual({ ok: true, bytes: null });
  });
});
