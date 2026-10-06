interface LiveConfig {
  version: string;
  liveServer: string;
  messageWs: string;
  userApi: string;
  liveApi: string;
  uploadUrl: string;
  smallClassNum: number;
}

type EnvRecord = Record<string, string | undefined>;

export function loadConfig(env: EnvRecord): LiveConfig {
  return {
    version: env.VITE_VERSION ?? '0.0.0',
    liveServer: env.VITE_LIVE_SERVER ?? '',
    messageWs: env.VITE_MESSAGE_WS ?? '',
    userApi: env.VITE_USER_API ?? '',
    liveApi: env.VITE_LIVE_API ?? '',
    uploadUrl: env.VITE_UPLOAD_URL ?? '',
    smallClassNum: Number(env.VITE_SMALL_CLASS_NUM ?? 10)
  };
}
