import { describe, expect, it, vi } from 'vitest';
import { useSharedView } from './useSharedView';

function setup(isTeacher: boolean, userId = 'u1') {
  const broadcast = vi.fn();
  const sv = useSharedView({ isTeacher, userId, broadcast });
  return { sv, broadcast };
}

describe('useSharedView（F3.4/F3.5 外挂视图开合状态）', () => {
  it('正向：教师 open 广播 {kind,userId} 并置本地 kind', () => {
    const { sv, broadcast } = setup(true);
    sv.open('circuit');
    expect(broadcast).toHaveBeenCalledWith({ kind: 'circuit', userId: 'u1' });
    expect(sv.kind.value).toBe('circuit');
  });

  it('正向：教师切换 kind 覆盖广播', () => {
    const { sv, broadcast } = setup(true);
    sv.open('circuit');
    sv.open('molecule');
    expect(broadcast).toHaveBeenLastCalledWith({ kind: 'molecule', userId: 'u1' });
    expect(sv.kind.value).toBe('molecule');
  });

  it('正向：教师 close 广播 null 并清 kind', () => {
    const { sv, broadcast } = setup(true);
    sv.open('molecule');
    sv.close();
    expect(broadcast).toHaveBeenLastCalledWith(null);
    expect(sv.kind.value).toBe(null);
  });

  it('负向：学生 open/close 被拒（不广播、不改 kind）', () => {
    const { sv, broadcast } = setup(false);
    sv.open('circuit');
    sv.close();
    expect(broadcast).not.toHaveBeenCalled();
    expect(sv.kind.value).toBe(null);
  });

  it('正向：学生 applyRemote 应用远端 kind', () => {
    const { sv } = setup(false);
    sv.applyRemote({ kind: 'molecule', userId: 'teacher-9' });
    expect(sv.kind.value).toBe('molecule');
    expect(sv.remote.value).toEqual({ kind: 'molecule', userId: 'teacher-9' });
  });

  it('负向：applyRemote 跳过本端 userId（双保险），远端态不清除', () => {
    const { sv } = setup(false);
    sv.applyRemote({ kind: 'molecule', userId: 'teacher-9' });
    sv.applyRemote({ kind: 'circuit', userId: 'u1' });
    expect(sv.kind.value).toBe('molecule');
  });

  it('正向：applyRemote(null)（peer 断线）→ 学生端清 kind，零残留', () => {
    const { sv } = setup(false);
    sv.applyRemote({ kind: 'circuit', userId: 'teacher-9' });
    sv.applyRemote(null);
    expect(sv.kind.value).toBe(null);
    expect(sv.remote.value).toBe(null);
  });

  it('负向：教师 applyRemote 忽略 kind（本端由本地开关驱动）', () => {
    const { sv, broadcast } = setup(true);
    sv.open('circuit');
    sv.applyRemote({ kind: 'molecule', userId: 'other-teacher' });
    expect(sv.kind.value).toBe('circuit');
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});
