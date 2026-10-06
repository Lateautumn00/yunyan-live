import { defineStore } from 'pinia';

/** 课堂参与者（由 Pople.updatePopleList 单漏斗写入，供 @提及选项构建） */
export interface RoomMember {
  userName?: string;
  opaqueId?: string;
  isTeacher?: boolean;
}

export const useRoomStore = defineStore('room', {
  state: (): { members: RoomMember[] } => ({
    members: []
  }),
  actions: {
    setMembers(members: RoomMember[]) {
      this.members = members;
    }
  }
});
