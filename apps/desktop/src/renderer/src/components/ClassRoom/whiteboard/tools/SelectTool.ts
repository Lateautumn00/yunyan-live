/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseTool } from './BaseTool';

export class SelectTool extends BaseTool {
  private selectedId: string | null = null;

  onPointerDown(e: any) {
    const pos = this.getPointerPos(e);
    if (!pos) return;

    // Find shape under cursor
    const shape = this.findShapeAt(pos.x, pos.y);
    if (shape) {
      this.selectedId = shape.get('id');
      // TODO: Show selection handles
    } else {
      this.selectedId = null;
    }
  }

  onPointerMove(_e: any) {
    // TODO: Drag selected shape
  }

  onPointerUp(_e: any) {
    // No-op
  }

  private findShapeAt(x: number, y: number): any | null {
    // Simple hit test - check bounding boxes
    for (const [id, data] of this.shapes.entries()) {
      if (this.isPointInShape(x, y, data)) {
        return this.shapes.get(id);
      }
    }
    return null;
  }

  private isPointInShape(x: number, y: number, data: any): boolean {
    switch (data.type) {
      case 'rect':
        return (
          x >= data.x &&
          x <= data.x + data.width &&
          y >= data.y &&
          y <= data.y + data.height
        );
      case 'circle': {
        const dx = x - data.x;
        const dy = y - data.y;
        return Math.sqrt(dx * dx + dy * dy) <= data.radius;
      }
      case 'text':
        return (
          x >= data.x &&
          x <= data.x + 200 &&
          y >= data.y &&
          y <= data.y + (data.fontSize || 16)
        );
      default:
        return false;
    }
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  deleteSelected() {
    if (this.selectedId) {
      this.shapes.delete(this.selectedId);
      this.selectedId = null;
    }
  }
}
