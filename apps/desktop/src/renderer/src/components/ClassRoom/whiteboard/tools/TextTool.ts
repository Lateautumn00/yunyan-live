/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseTool } from './BaseTool';

export class TextTool extends BaseTool {
  onPointerDown(e: any) {
    const pos = this.getPointerPos(e);
    if (!pos) return;

    const text = prompt('Enter text:');
    if (text) {
      const layerPos = this.toLayerCoords(pos);
      this.addShape('text', {
        x: layerPos.x,
        y: layerPos.y,
        text,
        fontSize: this.config.fontSize,
        color: this.config.color,
      });
    }
  }

  onPointerMove(_e: any) {
    // No-op for text tool
  }

  onPointerUp(_e: any) {
    // No-op for text tool
  }
}
