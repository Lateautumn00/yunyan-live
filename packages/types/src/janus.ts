export interface JanusSession {
  attach: (
    opts: {
      plugin: string;
      success?: (handle: JanusPluginHandle) => void;
      error?: (error: string) => void;
      consentDialog?: (on: boolean) => void;
    }
  ) => void;
  destroy: () => void;
  getServer: () => string;
  getId: () => number;
  isConnected: () => boolean;
  reconnect: () => void;
}

interface JanusPluginHandle {
  handleId: number;
  getId: () => number;
  send: (opts: { message?: unknown; jsep?: unknown; success?: (res: unknown) => void }) => void;
  detach: () => void;
  hangup: () => void;
  onmessage: (msg: unknown, jsep?: unknown) => void;
  onremotestream: (stream: MediaStream) => void;
  oncleanup: () => void;
}

export interface VideoRoomMessage {
  videoroom: string;
  room?: number | string;
  id?: number | string;
  display?: string;
  error_code?: number;
  error?: string;
  participants?: Array<{ id: number | string; display?: string; streams?: unknown[] }>;
  publishers?: Array<{ id: number | string; display?: string }>;
}

export interface RemoteFeed {
  id: number | string;
  display: string;
  audio: boolean;
  video: boolean;
  stream?: MediaStream;
  remoteStream?: MediaStream;
}
