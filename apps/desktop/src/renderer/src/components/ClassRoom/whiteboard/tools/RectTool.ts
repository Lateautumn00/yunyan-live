/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import { BaseTool } from './BaseTool';

export class RectTool extends BaseTool {
  private startPos: { x: number; y: number } | null = null;
  private tempRect: Konva.Rect | null = null;

  onPointerDown(e: any) {
    const pos = this.getPointerPos(e);
    if (!pos) return;
    this.isDrawing = true;
    this.startPos = pos;
  }

  onPointerMove(e: any) {
    if (!this.isDrawing || !this.startPos) return;
    const pos = this.getPointerPos(e);
    if (!pos) return;

    this.tempLayer.destroyChildren();
    this.tempRect = new Konva.Rect({
      x: Math.min(this.startPos.x, pos.x),
      y: Math.min(this.startPos.y, pos.y),
      width: Math.abs(pos.x - this.startPos.x),
      height: Math.abs(pos.y - this.startPos.y),
      stroke: this.config.color,
      strokeWidth: this.config.lineWidth,
    });
    this.tempLayer.add(this.tempRect);
    this.tempLayer.batchDraw();
  }

  onPointerUp(e: any) {
    if (!this.isDrawing || !this.startPos) return;
    this.isDrawing = false;

    this.tempLayer.destroyChildren();
    this.tempLayer.batchDraw();

    const pos = this.getPointerPos(e);
    if (pos) {
      const layerStart = this.toLayerCoords(this.startPos);
      const layerEnd = this.toLayerCoords(pos);
      const width = Math.abs(layerEnd.x - layerStart.x);
      const height = Math.abs(layerEnd.y - layerStart.y);
      if (width > 2 && height > 2) {
        this.addShape('rect', {
          x: Math.min(layerStart.x, layerEnd.x),
          y: Math.min(layerStart.y, layerEnd.y),
          width,
          height,
          color: this.config.color,
          lineWidth: this.config.lineWidth,
        });
      }
    }
    this.startPos = null;
  }
}
