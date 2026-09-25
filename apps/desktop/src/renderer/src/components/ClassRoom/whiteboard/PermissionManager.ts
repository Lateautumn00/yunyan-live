/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PermissionEvent {
  granted: boolean;
  userId: string;
}

type PermissionCallback = (event: PermissionEvent) => void;

export class PermissionManager {
  private canEdit = false;
  private isTeacher = false;
  private currentUserId: string;
  private roomId: string;
  private api: any;
  private listeners: PermissionCallback[] = [];

  constructor(roomId: string, userId: string, isTeacher: boolean, api: any) {
    this.roomId = roomId;
    this.currentUserId = userId;
    this.isTeacher = isTeacher;
    this.api = api;

    if (isTeacher) {
      this.canEdit = true;
    }
  }

  onPermissionChanged(callback: PermissionCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  async grantEdit(userId: string): Promise<void> {
    if (!this.isTeacher) return;
    try {
      await this.api.post('/live/liveInfo/grantEdit', {
        roomId: this.roomId,
        userId,
        canEdit: true,
      });
    } catch (err) {
      console.error('Failed to grant edit permission:', err);
    }
  }

  async revokeEdit(userId: string): Promise<void> {
    if (!this.isTeacher) return;
    try {
      await this.api.post('/live/liveInfo/grantEdit', {
        roomId: this.roomId,
        userId,
        canEdit: false,
      });
    } catch (err) {
      console.error('Failed to revoke edit permission:', err);
    }
  }

  async requestEdit(): Promise<void> {
    if (this.isTeacher) return;
    try {
      await this.api.post('/live/liveInfo/requestEdit', {
        roomId: this.roomId,
      });
    } catch (err) {
      console.error('Failed to request edit permission:', err);
    }
  }

  onPermissionChangedRemote(userId: string, canEdit: boolean): void {
    if (userId === this.currentUserId) {
      this.canEdit = canEdit;
      this.listeners.forEach((cb) => cb({ granted: canEdit, userId }));
    }
  }

  checkEditable(): boolean {
    return this.isTeacher || this.canEdit;
  }

  getCanEdit(): boolean {
    return this.canEdit;
  }

  getIsTeacher(): boolean {
    return this.isTeacher;
  }

  destroy(): void {
    this.listeners = [];
  }
}
