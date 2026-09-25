/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseTool } from './BaseTool';

export class PanTool extends BaseTool {
  private lastPointer: { x: number; y: number } | null = null;

  onPointerDown(e: any) {
    const pos = this.getPointerPos(e);
    if (!pos) return;
    this.isDrawing = true;
    this.lastPointer = pos;
    this.stage.container().style.cursor = 'grabbing';
  }

  onPointerMove(e: any) {
    if (!this.isDrawing || !this.lastPointer) return;
    const pos = this.getPointerPos(e);
    if (!pos) return;

    const dx = pos.x - this.lastPointer.x;
    const dy = pos.y - this.lastPointer.y;

    const layer = this.mainLayer;
    const oldX = layer.x();
    const oldY = layer.y();
    layer.x(oldX + dx);
    layer.y(oldY + dy);
    layer.batchDraw();

    this.lastPointer = pos;
  }

  onPointerUp(_e: any) {
    this.isDrawing = false;
    this.lastPointer = null;
    this.stage.container().style.cursor = 'default';
  }
}
