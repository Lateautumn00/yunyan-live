/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import * as Y from 'yjs';

export interface ToolConfig {
  color: string;
  lineWidth: number;
  fontSize: number;
}

export abstract class BaseTool {
  protected shapes: Y.Map<any>;
  protected config: ToolConfig;
  protected isDrawing = false;
  protected tempLayer: Konva.Layer;
  protected mainLayer: Konva.Layer;
  protected stage: Konva.Stage;
  protected roomId: string;

  constructor(
    stage: Konva.Stage,
    mainLayer: Konva.Layer,
    tempLayer: Konva.Layer,
    shapes: Y.Map<any>,
    roomId: string,
  ) {
    this.stage = stage;
    this.mainLayer = mainLayer;
    this.tempLayer = tempLayer;
    this.shapes = shapes;
    this.roomId = roomId;
    this.config = { color: '#000000', lineWidth: 2, fontSize: 16 };
  }

  setConfig(config: Partial<ToolConfig>) {
    this.config = { ...this.config, ...config };
  }

  abstract onPointerDown(e: any): void;
  abstract onPointerMove(e: any): void;
  abstract onPointerUp(_e: any): void;

  getPointerPos(_e: any): { x: number; y: number } | null {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    const transform = this.stage.getAbsoluteTransform().copy().invert();
    return transform.point(pointer);
  }

  toLayerCoords(pos: { x: number; y: number }): { x: number; y: number } {
    return { x: pos.x - this.mainLayer.x(), y: pos.y - this.mainLayer.y() };
  }

  generateId(): string {
    return `${this.roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  addShape(type: string, data: Record<string, any>) {
    const id = this.generateId();
    const shapeData = { id, type, ...data };
    this.shapes.set(id, shapeData);
    return id;
  }

  destroy() {
    this.tempLayer.destroyChildren();
  }
}
