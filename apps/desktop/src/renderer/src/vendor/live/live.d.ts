export interface JanusHandle {
  createAnswer(options: {
    jsep: unknown;
    media: Record<string, unknown>;
    success: (jsep: unknown) => void;
    error: (error: unknown) => void;
  }): void;
  createOffer(options: {
    media: Record<string, unknown>;
    success: (jsep: unknown) => void;
    error: (error: unknown) => void;
  }): void;
  handleRemoteJsep(options: { jsep: unknown }): void;
  send(options: {
    message: Record<string, unknown>;
    jsep?: unknown;
    success?: (result: Record<string, unknown>) => void;
    error?: (error: unknown) => void;
  }): void;
  data(options: {
    text: string;
    error?: (reason: unknown) => void;
    success?: (msg: unknown) => void;
  }): void;
  hangup(): void;
  detach(): void;
  videoCodec?: string;
  audioCodec?: string;
}

export interface JanusSession {
  attach(options: {
    plugin: string;
    opaqueId?: string;
    success: (handle: JanusHandle) => void;
    error: (error: unknown) => void;
    webrtcState?: (on: boolean) => void;
    onmessage?: (msg: Record<string, unknown>, jsep?: unknown) => void;
    onlocalstream?: (stream: MediaStream) => void;
    onremotestream?: (stream: MediaStream) => void;
    ondataopen?: () => void;
    ondata?: (data: string) => void;
    oncleanup?: () => void;
  }): void;
  destroy(): void;
}

export interface LiveConstructor {
  new (options: {
    server: string;
    success: () => void;
    error: (error: unknown) => void;
    destroyed?: () => void;
  }): JanusSession;
}

declare const Live: LiveConstructor & {
  init(options: {
    debug: string;
    callback: () => void;
    dependencies?: unknown;
    keepAlivePeriod?: number;
    pollPeriod?: number;
    token?: string;
    apisecret?: string;
  }): void;
  useDefaultDependencies(options?: { adapter?: unknown }): unknown;
};

export default Live;
