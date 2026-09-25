/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import { BaseTool } from './BaseTool';

export class BrushTool extends BaseTool {
  private points: number[] = [];
  private tempLine: Konva.Line | null = null;

  onPointerDown(e: any) {
    const pos = this.getPointerPos(e);
    if (!pos) return;
    this.isDrawing = true;
    this.points = [pos.x, pos.y];
  }

  onPointerMove(e: any) {
    if (!this.isDrawing) return;
    const pos = this.getPointerPos(e);
    if (!pos) return;

    this.points.push(pos.x, pos.y);

    // Draw temp line
    this.tempLayer.destroyChildren();
    this.tempLine = new Konva.Line({
      points: this.points,
      stroke: this.config.color,
      strokeWidth: this.config.lineWidth,
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.5,
    });
    this.tempLayer.add(this.tempLine);
    this.tempLayer.batchDraw();
  }

  onPointerUp(_e: any) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    this.tempLayer.destroyChildren();
    this.tempLayer.batchDraw();

    if (this.points.length > 2) {
      const layerPoints: number[] = [];
      for (let i = 0; i < this.points.length; i += 2) {
        const lp = this.toLayerCoords({ x: this.points[i]!, y: this.points[i + 1]! });
        layerPoints.push(lp.x, lp.y);
      }
      this.addShape('brush', {
        points: layerPoints,
        color: this.config.color,
        lineWidth: this.config.lineWidth,
      });
    }
    this.points = [];
  }
}
