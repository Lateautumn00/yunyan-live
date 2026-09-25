/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import { BaseTool } from './BaseTool';

export class CircleTool extends BaseTool {
  private startPos: { x: number; y: number } | null = null;
  private tempCircle: Konva.Circle | null = null;

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

    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const radius = Math.sqrt(dx * dx + dy * dy);

    this.tempLayer.destroyChildren();
    this.tempCircle = new Konva.Circle({
      x: this.startPos.x,
      y: this.startPos.y,
      radius,
      stroke: this.config.color,
      strokeWidth: this.config.lineWidth,
    });
    this.tempLayer.add(this.tempCircle);
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
      const dx = layerEnd.x - layerStart.x;
      const dy = layerEnd.y - layerStart.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius > 2) {
        this.addShape('circle', {
          x: layerStart.x,
          y: layerStart.y,
          radius,
          color: this.config.color,
          lineWidth: this.config.lineWidth,
        });
      }
    }
    this.startPos = null;
  }
}
