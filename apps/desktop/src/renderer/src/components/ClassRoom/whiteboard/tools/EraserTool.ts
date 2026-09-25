/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import { BaseTool } from './BaseTool';

export class EraserTool extends BaseTool {
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

    this.tempLayer.destroyChildren();
    this.tempLine = new Konva.Line({
      points: this.points,
      stroke: '#ffffff',
      strokeWidth: this.config.lineWidth * 3,
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
      this.addShape('eraser', {
        points: layerPoints,
        color: '#ffffff',
        lineWidth: this.config.lineWidth * 3,
      });
    }
    this.points = [];
  }
}
