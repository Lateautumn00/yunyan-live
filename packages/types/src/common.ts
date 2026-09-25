export interface ApiResult<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

export interface UserInfo {
  guid: string;
  token: string;
  userName: string;
  email: string;
  role: number; // 1=teacher, 2=student
}

export interface LiveInfo {
  liveUserId: string;
  nickName: string;
  joinCode: string;
}

export interface SessionTokens {
  token: string;
  guid: string;
}

export type LoginRoleName = 'teacher' | 'student' | string;

export type LiveType = 'smallClass' | 'largeClass' | string;
