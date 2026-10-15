import { computed, ref } from 'vue';
import api from '@/api';
import { useServerTime } from './useServerTime';

export type CheckinAction = 'started' | 'update' | 'ended' | 'makeup';

export interface CheckinSessionInfo {
  sessionId: string;
  roomId: string;
  startedAt: string;
  deadlineAt: string;
  endedAt: string | null;
  attendeeCount: number;
  signedCount: number;
  makeupOpen: boolean;
  status: 1 | 2;
  mySigned: boolean;
  myMethod: number;
}

export interface CheckinWsPayload {
  roomId: string;
  action: CheckinAction;
  sessionId: string;
  deadlineAt?: string;
  signedCount?: number;
}

export interface CheckinStateData {
  hasSession: boolean;
  isOwner: boolean;
  session: CheckinSessionInfo | null;
}

/** 单例状态：Top 面板（教师）、CheckinDialog（学生）、WS 事件共享同一份数据 */
const session = ref<CheckinSessionInfo | null>(null);
const hasSession = ref(false);
const isOwner = ref(false);
const dialogVisible = ref(false);
const minimized = ref(false);
const loading = ref(false);
const error = ref(false);
const submitting = ref(false);
const serverOffset = ref(0);
const tick = ref(Date.now());
const duration = ref(60);

let timer: ReturnType<typeof setInterval> | null = null;
/** hydrate 竞态守卫：只采纳最新一次请求的响应，旧响应（含跨房间）直接丢弃 */
let hydrateSeq = 0;

const deadlineMs = computed(() => {
  const s = session.value;
  if (!s) return 0;
  const ms = new Date(s.deadlineAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
});

/** 剩余秒数（服务器时间口径：tick + offset，Q9/验收 #2） */
const remaining = computed(() => {
  const s = session.value;
  if (!s) return 0;
  const left = Math.ceil((deadlineMs.value - (tick.value + serverOffset.value)) / 1000);
  return left > 0 ? left : 0;
});

/** 本地派生关闭态（修订③口径：手动结束或过期即关，无需服务器轮询） */
const closed = computed(() => {
  const s = session.value;
  if (!s) return true;
  if (s.endedAt) return true;
  return remaining.value <= 0;
});

function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 倒计时时钟：session 存活期间每 250ms 推进；关闭后自停 */
function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick.value = Date.now();
    if (session.value && closed.value) stopTimer();
  }, 250);
}

/** 应到：0 → '—'（Q12） */
const attendeeLabel = computed(() => {
  const s = session.value;
  if (!s || s.attendeeCount <= 0) return '—';
  return String(s.attendeeCount);
});

/** 修订②：同 session 内计数只增，丢弃并发广播的旧值 */
function applySignedCount(sessionId: string, signedCount?: number): void {
  const s = session.value;
  if (!s || s.sessionId !== sessionId || signedCount === undefined) return;
  if (signedCount > s.signedCount) s.signedCount = signedCount;
}

const { getServerTime } = useServerTime();

async function syncServerTime(): Promise<void> {
  const timeStr = await getServerTime();
  const ms = Number(timeStr);
  if (Number.isFinite(ms) && ms > 0) serverOffset.value = ms - Date.now();
}

/** 初态水合（打开面板/学生弹窗挂载/未知轮次广播时调用） */
async function hydrate(roomId: string): Promise<void> {
  if (!roomId) return;
  const seq = ++hydrateSeq;
  loading.value = true;
  error.value = false;
  try {
    const res = await api.checkin_state({ roomId });
    if (seq !== hydrateSeq) return;
    hasSession.value = Boolean(res.data?.hasSession);
    isOwner.value = Boolean(res.data?.isOwner);
    session.value = res.data?.session ?? null;
    tick.value = Date.now();
    await syncServerTime();
    if (seq !== hydrateSeq) return;
    if (session.value && !closed.value) ensureTimer();
  } catch (err) {
    if (seq === hydrateSeq) error.value = true;
    console.error('checkin hydrate failed:', err);
  } finally {
    if (seq === hydrateSeq) loading.value = false;
  }
}

/** 教师发起新一轮（旧轮由 live-service 同事务自动 ended） */
async function start(roomId: string, dur: number): Promise<void> {
  submitting.value = true;
  try {
    const res = await api.checkin_start({ roomId, duration: dur });
    session.value = res.data;
    hasSession.value = true;
    isOwner.value = true;
    minimized.value = false;
    tick.value = Date.now();
    await syncServerTime();
    ensureTimer();
  } finally {
    submitting.value = false;
  }
}

/** 学生签到（窗口内正常签；关闭后 makeup=true 补签，服务端校验） */
async function respond(roomId: string, makeup = false): Promise<void> {
  const s = session.value;
  if (!s) return;
  submitting.value = true;
  try {
    const res = await api.checkin_respond({ roomId, sessionId: s.sessionId, makeup });
    const data = res.data;
    if (session.value && session.value.sessionId === s.sessionId) {
      session.value.mySigned = true;
      if (!session.value.myMethod) session.value.myMethod = makeup ? 2 : 1;
      applySignedCount(s.sessionId, data?.signedCount);
    }
  } finally {
    submitting.value = false;
  }
}

/** 教师手动结束本轮 */
async function end(roomId: string): Promise<void> {
  const s = session.value;
  if (!s) return;
  submitting.value = true;
  try {
    const res = await api.checkin_end({ roomId, sessionId: s.sessionId });
    if (res.data) session.value = res.data;
    stopTimer();
  } finally {
    submitting.value = false;
  }
}

/** 教师为已关闭轮次开启补签 */
async function openMakeup(roomId: string): Promise<void> {
  const s = session.value;
  if (!s) return;
  submitting.value = true;
  try {
    const res = await api.checkin_open_makeup({ roomId, sessionId: s.sessionId });
    if (res.data) session.value = res.data;
  } finally {
    submitting.value = false;
  }
}

/** Chat.vue 'checkin' 帧入口（帧含 sessionId，修订②③） */
function handleWs(payload: CheckinWsPayload | undefined): void {
  if (!payload?.roomId || !payload.sessionId) return;
  const s = session.value;

  if (payload.action === 'started') {
    if (!s || s.sessionId !== payload.sessionId) {
      // 乐观建态：先用帧内字段渲染倒计时，hydrate 回填完整数据（应到/我的状态）
      session.value = {
        sessionId: payload.sessionId,
        roomId: payload.roomId,
        startedAt: '',
        deadlineAt: payload.deadlineAt ?? new Date(Date.now() + 60_000).toISOString(),
        endedAt: null,
        attendeeCount: 0,
        signedCount: 0,
        makeupOpen: false,
        status: 1,
        mySigned: false,
        myMethod: 0
      };
      hasSession.value = true;
      tick.value = Date.now();
      ensureTimer();
      void hydrate(payload.roomId);
    }
    dialogVisible.value = true;
    minimized.value = false;
    return;
  }
  if (!s || s.sessionId !== payload.sessionId) {
    void hydrate(payload.roomId);
    return;
  }
  if (payload.action === 'update') {
    applySignedCount(payload.sessionId, payload.signedCount);
    ensureTimer();
    return;
  }
  if (payload.action === 'ended') {
    if (!s.endedAt) s.endedAt = new Date().toISOString();
    applySignedCount(payload.sessionId, payload.signedCount);
    stopTimer();
    return;
  }
  if (payload.action === 'makeup') {
    s.makeupOpen = true;
  }
}

/** 课堂卸载：清 interval 与全部状态（序号递增使在途 hydrate 失效） */
function reset(): void {
  hydrateSeq += 1;
  stopTimer();
  session.value = null;
  hasSession.value = false;
  isOwner.value = false;
  dialogVisible.value = false;
  minimized.value = false;
  loading.value = false;
  error.value = false;
  submitting.value = false;
  serverOffset.value = 0;
  duration.value = 60;
}

export function useClassroomCheckin() {
  return {
    session,
    hasSession,
    isOwner,
    dialogVisible,
    minimized,
    loading,
    error,
    submitting,
    duration,
    remaining,
    closed,
    attendeeLabel,
    hydrate,
    start,
    respond,
    end,
    openMakeup,
    handleWs,
    reset,
    syncServerTime
  };
}
