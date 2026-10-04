export const RoomStatus = {
  NOT_STARTED: 1,
  LIVE: 2,
  ENDED: 3,
  PAUSED: 4
} as const;

export const ROOM_STATUS_TEXT: Record<number, string> = {
  [RoomStatus.NOT_STARTED]: '未开始',
  [RoomStatus.LIVE]: '直播中',
  [RoomStatus.ENDED]: '已结束',
  [RoomStatus.PAUSED]: '暂停'
};

export const ROOM_STATUS_TAG: Record<number, 'info' | 'success' | 'danger' | 'warning'> = {
  [RoomStatus.NOT_STARTED]: 'info',
  [RoomStatus.LIVE]: 'success',
  [RoomStatus.ENDED]: 'danger',
  [RoomStatus.PAUSED]: 'warning'
};
