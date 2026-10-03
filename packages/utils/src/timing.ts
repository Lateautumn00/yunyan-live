type Timer = ReturnType<typeof setTimeout>;
type FrameHandle = number | Timer;

export interface Cancelable<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

export interface DebounceOptions {
  leading?: boolean;
}

/**
 * 防抖：wait 内重复调用会重置计时，只在静默 wait 后触发一次。
 * options.leading = true 时，空闲状态的首次调用立即执行，窗口内最后一次调用仍在尾沿补发。
 * 返回函数带 cancel()（丢弃挂起调用）与 flush()（立即执行挂起调用）。
 */
export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  wait: number,
  options: DebounceOptions = {}
): Cancelable<A> {
  const leading = options.leading ?? false;
  let timer: Timer | null = null;
  let pending: A | null = null;

  function invoke(args: A): void {
    pending = null;
    fn(...args);
  }

  function onTimer(): void {
    timer = null;
    if (pending) invoke(pending);
  }

  const wrapped = ((...args: A) => {
    if (leading && timer === null) {
      fn(...args);
      pending = null;
    } else {
      pending = args;
    }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(onTimer, wait);
  }) as Cancelable<A>;

  wrapped.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  wrapped.flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending) invoke(pending);
  };

  return wrapped;
}

/**
 * 节流：默认 leading + trailing。首次调用立即执行，随后 wait 窗口内的调用
 * 只在窗口结束时用最后一次参数补发一次；持续调用则按窗口连续触发。
 * 带 cancel() 与 flush()。
 */
export function throttle<A extends unknown[], R>(
  fn: (...args: A) => R,
  wait: number,
  options: DebounceOptions = {}
): Cancelable<A> {
  const leading = options.leading ?? true;
  let timer: Timer | null = null;
  let pending: A | null = null;
  let windowOpen = false;

  function invoke(args: A): void {
    pending = null;
    fn(...args);
  }

  function openWindow(): void {
    windowOpen = true;
    timer = setTimeout(onExpire, wait);
  }

  function onExpire(): void {
    if (pending) {
      invoke(pending);
      timer = setTimeout(onExpire, wait);
      return;
    }
    timer = null;
    windowOpen = false;
  }

  const wrapped = ((...args: A) => {
    if (!windowOpen) {
      openWindow();
      if (leading) invoke(args);
      else pending = args;
      return;
    }
    pending = args;
  }) as Cancelable<A>;

  wrapped.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
    windowOpen = false;
  };

  wrapped.flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    windowOpen = false;
    if (pending) invoke(pending);
  };

  return wrapped;
}

/**
 * 帧合并：每动画帧至多执行一次，始终携带最后一次调用的参数（不立即执行）。
 * 无 requestAnimationFrame 环境（如 node 单测）退化为 16ms setTimeout。
 * 带 cancel() 与 flush()。
 */
export function frameThrottle<A extends unknown[], R>(fn: (...args: A) => R): Cancelable<A> {
  let handle: FrameHandle | null = null;
  let cancelHandle: ((h: FrameHandle) => void) | null = null;
  let pending: A | null = null;

  function invoke(args: A): void {
    pending = null;
    fn(...args);
  }

  function onFrame(): void {
    handle = null;
    cancelHandle = null;
    if (pending) invoke(pending);
  }

  function schedule(): void {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      const id = globalThis.requestAnimationFrame(onFrame);
      handle = id;
      cancelHandle = h => globalThis.cancelAnimationFrame(h as number);
    } else {
      const id = setTimeout(onFrame, 16);
      handle = id;
      cancelHandle = h => clearTimeout(h as Timer);
    }
  }

  const wrapped = ((...args: A) => {
    pending = args;
    if (handle === null) schedule();
  }) as Cancelable<A>;

  wrapped.cancel = () => {
    if (handle !== null && cancelHandle) cancelHandle(handle);
    handle = null;
    cancelHandle = null;
    pending = null;
  };

  wrapped.flush = () => {
    if (handle !== null && cancelHandle) cancelHandle(handle);
    handle = null;
    cancelHandle = null;
    if (pending) invoke(pending);
  };

  return wrapped;
}
