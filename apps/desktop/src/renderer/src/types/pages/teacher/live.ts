export interface LiveForm {
  id?: string;
  title: string;
  coverUrl?: string;
  startTime: string;
  type: number;
  introduction?: string;
  roomId: string;
  duration?: number;
}

export interface LiveRoom {
  id?: string;
  title: string;
  speakerName: string;
  applicantName?: string;
  coverUrl?: string;
  createTime?: string;
  startTime: string;
  createById?: string;
  type: number;
  status?: number;
  introduction?: string;
  roomId?: string;
  watchNum?: number;
  joinCode?: string;
  duration?: number;
  time?: string;
  hasVideo?: number;
  count?: number;
}

export interface WatchItem {
  userId: string;
  nickName?: string;
  watchTime: number;
  joinedAt: string;
  leftAt: string;
  isOnline?: boolean;
}

export interface VideoItem {
  roomId?: string;
  id?: string;
  duration?: number;
  createTime?: string | number;
  recordType?: number;
  filePath?: string;
  address?: string;
}
