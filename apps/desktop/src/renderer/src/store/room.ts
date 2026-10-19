import { defineStore } from 'pinia';
import type { RosterMember } from '@yunyan-live/types';

/** 课堂参与者（由 Pople.updatePopleList 单漏斗写入，供 @提及选项构建） */
export interface RoomMember {
  userName?: string;
  opaqueId?: string;
  isTeacher?: boolean;
}

/** F3 单用户管控视图（senderId=JWT sub 维度；数据源=chat 'moderation' 帧） */
export interface ModerationView {
  /** mute 到期毫秒（expire/release 清除）；kicked 仅布尔 */
  mutedUntilMs?: number;
  kicked?: boolean;
}

export const useRoomStore = defineStore('room', {
  state: (): {
    members: RoomMember[];
    chatRoster: RosterMember[];
    moderation: Record<string, ModerationView>;
  } => ({
    members: [],
    chatRoster: [],
    moderation: {}
  }),
  actions: {
    setMembers(members: RoomMember[]) {
      this.members = members;
    },
    setChatRoster(members: RosterMember[]) {
      this.chatRoster = members;
    },
    /** chat 'moderation' 帧：set/expire/release 状态机（kind=mute|kick, op=set|release|expire） */
    applyModeration(frame: { userId: string; kind: string; op: string; untilMs?: number }) {
      const view = { ...(this.moderation[frame.userId] ?? {}) };
      if (frame.kind === 'mute') {
        if (frame.op === 'set') view.mutedUntilMs = frame.untilMs;
        else delete view.mutedUntilMs;
      } else {
        if (frame.op === 'set') view.kicked = true;
        else delete view.kicked;
      }
      if (view.mutedUntilMs === undefined && !view.kicked) {
        const next = { ...this.moderation };
        delete next[frame.userId];
        this.moderation = next;
      } else {
        this.moderation = { ...this.moderation, [frame.userId]: view };
      }
    }
  }
});
