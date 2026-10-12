import { ref, type Ref } from 'vue';
import type { SharedViewKind, SharedViewState } from './types';

/** F3.4/F3.5 外挂视图开合状态：教师=本地开关+awareness 广播，学生=远端广播跟随 */
export interface SharedViewDeps {
  isTeacher: boolean;
  userId: string;
  /** 写入通道（provider.setSharedView 的注入壳；学生端永不调用） */
  broadcast: (state: SharedViewState | null) => void;
}

export function useSharedView(deps: SharedViewDeps): {
  /** 生效中的视图种类（教师=本地开关，学生=远端广播；null=关） */
  kind: Ref<SharedViewKind | null>;
  /** 学生端收到的远端广播原值（断线 awareness 自动移除 → null） */
  remote: Ref<SharedViewState | null>;
  open: (kind: SharedViewKind) => void;
  close: () => void;
  applyRemote: (state: SharedViewState | null) => void;
} {
  const kind = ref<SharedViewKind | null>(null);
  const remote = ref<SharedViewState | null>(null);

  function open(k: SharedViewKind): void {
    if (!deps.isTeacher) return;
    kind.value = k;
    deps.broadcast({ kind: k, userId: deps.userId });
  }

  function close(): void {
    if (!deps.isTeacher) return;
    kind.value = null;
    deps.broadcast(null);
  }

  /** awareness 帧回灌：跳过本端 userId（双保险）；仅学生端应用 kind（教师本端由本地开关驱动） */
  function applyRemote(state: SharedViewState | null): void {
    if (state && state.userId === deps.userId) return;
    remote.value = state;
    if (!deps.isTeacher) kind.value = state?.kind ?? null;
  }

  return { kind, remote, open, close, applyRemote };
}
