/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';

export interface CursorInfo {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
}

export class AwarenessManager {
  private awareness: any;
  private cursors: Map<string, Konva.Group> = new Map();
  private layer: Konva.Layer;
  private currentUserId: string;
  private _onChange: (() => void) | null = null;

  constructor(awareness: any, layer: Konva.Layer, currentUserId: string) {
    this.awareness = awareness;
    this.layer = layer;
    this.currentUserId = currentUserId;

    this._onChange = () => this.handleAwarenessChange();
    this.awareness.on('change', this._onChange);
  }

  updateCursor(x: number, y: number, userName: string, color: string): void {
    this.awareness.setLocalStateField('cursor', {
      userId: this.currentUserId,
      userName,
      x,
      y,
      color,
    });
  }

  private handleAwarenessChange(): void {
    const states = this.awareness.getStates();
    const activeUserIds = new Set<string>();

    states.forEach((state: any) => {
      if (!state?.cursor) return;
      const cursor = state.cursor;
      if (cursor.userId === this.currentUserId) return;
      activeUserIds.add(cursor.userId);

      let cursorGroup = this.cursors.get(cursor.userId);
      if (!cursorGroup) {
        cursorGroup = this.createCursorGroup(cursor);
        this.cursors.set(cursor.userId, cursorGroup);
        this.layer.add(cursorGroup);
      }
      cursorGroup.x(cursor.x);
      cursorGroup.y(cursor.y);
    });

    this.cursors.forEach((group, userId) => {
      if (!activeUserIds.has(userId)) {
        group.destroy();
        this.cursors.delete(userId);
      }
    });

    this.layer.batchDraw();
  }

  private createCursorGroup(cursor: CursorInfo): Konva.Group {
    const group = new Konva.Group();

    const arrow = new Konva.Arrow({
      points: [0, 0, 12, 10, 4, 10, 0, 14],
      fill: cursor.color,
      stroke: cursor.color,
      strokeWidth: 1,
      pointerLength: 6,
      pointerWidth: 6,
    });

    const label = new Konva.Text({
      x: 14,
      y: 8,
      text: cursor.userName || 'User',
      fontSize: 11,
      fill: '#fff',
      padding: 3,
      fontFamily: 'Arial',
    });

    const labelBg = new Konva.Rect({
      x: 14,
      y: 8,
      width: label.width() + 6,
      height: 17,
      fill: cursor.color,
      cornerRadius: 3,
    });

    group.add(labelBg);
    group.add(label);
    group.add(arrow);

    return group;
  }

  clearCursors(): void {
    this.cursors.forEach((group) => group.destroy());
    this.cursors.clear();
    this.layer.batchDraw();
  }

  destroy(): void {
    if (this._onChange) {
      this.awareness.off('change', this._onChange);
    }
    this.clearCursors();
  }
}
