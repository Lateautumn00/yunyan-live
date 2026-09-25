/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import { BaseTool } from './BaseTool';

export class ArrowTool extends BaseTool {
  private startPos: { x: number; y: number } | null = null;
  private tempArrow: Konva.Arrow | null = null;

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
    this.tempArrow = new Konva.Arrow({
      points: [this.startPos.x, this.startPos.y, pos.x, pos.y],
      stroke: this.config.color,
      strokeWidth: this.config.lineWidth,
      fill: this.config.color,
    });
    this.tempLayer.add(this.tempArrow);
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
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 5) {
        this.addShape('arrow', {
          points: [layerStart.x, layerStart.y, layerEnd.x, layerEnd.y],
          color: this.config.color,
          lineWidth: this.config.lineWidth,
        });
      }
    }
    this.startPos = null;
  }
}
