/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import * as Y from 'yjs';
import { renderPdfPage } from './pdfAsset';

export class KonvaRenderer {
  stage: Konva.Stage;
  layer: Konva.Layer;
  tempLayer: Konva.Layer;
  private layers: Konva.Layer[] = [];
  private layerMap = new Map<number, Konva.Layer>();
  private nodeMap = new Map<string, Konva.Node>();
  private zoomLevel = 100;
  pageIds: string[] = [];

  constructor(container: HTMLElement) {
    this.stage = new Konva.Stage({
      container: container as HTMLDivElement,
      width: container.clientWidth,
      height: container.clientHeight,
    });
    this.layer = new Konva.Layer();
    this.tempLayer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.add(this.tempLayer);
    this.layers = [this.layer];
    this.layerMap.set(0, this.layer);
  }

  addPage(index: number, pageId?: string): Konva.Layer {
    if (index < this.layers.length && index >= this.pageIds.length) {
      const existingLayer = this.layers[index]!;
      this.pageIds.splice(index, 0, pageId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      this.rebuildLayerMap();
      return existingLayer;
    }
    const newLayer = new Konva.Layer();
    this.stage.add(newLayer);
    newLayer.hide();
    this.layers.splice(index, 0, newLayer);
    this.pageIds.splice(index, 0, pageId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    this.layerMap.set(index, newLayer);
    this.rebuildLayerMap();
    return newLayer;
  }

  showPage(index: number) {
    this.layers.forEach((l, i) => {
      if (i === index) l.show(); else l.hide();
    });
    this.layer = this.layers[index]!;
    this.tempLayer.moveToTop();
    this.rebuildLayerMap();
    this.stage.batchDraw();
  }

  removePage(index: number) {
    if (this.layers.length <= 1) return;
    const removed = this.layers[index];
    if (!removed) return;
    removed.destroy();
    this.layers.splice(index, 1);
    if (index < this.pageIds.length) this.pageIds.splice(index, 1);
    this.rebuildLayerMap();
    const newIndex = Math.min(index, this.layers.length - 1);
    this.showPage(newIndex);
  }

  removePageById(pageId: string) {
    const idx = this.pageIds.indexOf(pageId);
    if (idx >= 0) this.removePage(idx);
  }

  getPageCount(): number {
    return this.layers.length;
  }

  getCurrentPageIndex(): number {
    return this.layers.indexOf(this.layer);
  }

  private rebuildLayerMap() {
    this.layerMap.clear();
    this.layers.forEach((l, i) => this.layerMap.set(i, l));
  }

  setZoom(pct: number) {
    this.zoomLevel = Math.max(1, Math.min(200, pct));
    const scale = this.zoomLevel / 100;
    this.layer.scaleX(scale);
    this.layer.scaleY(scale);
    this.layer.batchDraw();
  }

  zoomIn(): number {
    this.setZoom(this.zoomLevel + 1);
    return this.zoomLevel;
  }

  zoomOut(): number {
    this.setZoom(this.zoomLevel - 1);
    return this.zoomLevel;
  }

  zoomFitAll(): void {
    const children = this.layer.getChildren();
    if (children.length === 0) {
      this.setZoom(100);
      this.stage.x(0);
      this.stage.y(0);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    children.forEach((child: any) => {
      const box = child.getClientRect({ relativeTo: this.layer });
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    });
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const scaleX = this.stage.width() / contentW;
    const scaleY = this.stage.height() / contentH;
    const scale = Math.min(scaleX, scaleY, 2) * 0.9;
    this.setZoom(Math.round(scale * 100));
    this.stage.x((this.stage.width() - contentW * scale) / 2 - minX * scale);
    this.stage.y((this.stage.height() - contentH * scale) / 2 - minY * scale);
  }

  getZoom(): number {
    return this.zoomLevel;
  }

  bindElements(elements: Y.Array<any>) {
    this.nodeMap.clear();
    this.layer.destroyChildren();
    elements.forEach((el: any) => {
      const node = this.createNode(el);
      if (node) {
        this.layer.add(node as any);
        this.nodeMap.set(el.get('id') as string, node);
      }
    });
    this.layer.batchDraw();
  }

  private createNode(data: any): Konva.Node | null {
    const type = data.get('type');
    const opacity = data.get('opacity') ?? 1;
    switch (type) {
      case 'brush':
      case 'eraser':
        return new Konva.Line({
          points: (data.get('points') as number[]) || [],
          stroke: type === 'eraser' ? '#ffffff' : (data.get('color') as string),
          strokeWidth: (data.get('lineWidth') as number) || 1,
          lineCap: 'round', lineJoin: 'round', tension: 0.5,
          opacity,
        });
      case 'rect':
        return new Konva.Rect({
          x: data.get('x') || 0, y: data.get('y') || 0,
          width: data.get('width') || 0, height: data.get('height') || 0,
          stroke: data.get('color') || '#000',
          strokeWidth: data.get('lineWidth') || 1,
          opacity,
        });
      case 'circle':
        return new Konva.Circle({
          x: data.get('x') || 0, y: data.get('y') || 0,
          radius: data.get('radius') || 0,
          stroke: data.get('color') || '#000',
          strokeWidth: (data.get('lineWidth') as number) || 1,
          opacity,
        });
      case 'arrow':
        return new Konva.Arrow({
          points: (data.get('points') as number[]) || [],
          stroke: data.get('color') || '#000',
          strokeWidth: (data.get('lineWidth') as number) || 1,
          fill: data.get('color') || '#000',
          opacity,
        });
      case 'text':
        return new Konva.Text({
          x: data.get('x') || 0, y: data.get('y') || 0,
          text: data.get('text') || '',
          fontSize: data.get('fontSize') || 14,
          fill: data.get('color') || '#000',
          opacity,
        });
      case 'ppt-image': {
        const pdfUrl = data.get('pdfUrl') as string | undefined;
        const base = {
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          width: data.get('width') || 0,
          height: data.get('height') || 0,
        };
        if (pdfUrl) {
          const node = new Konva.Image({ ...base, image: null as unknown as HTMLImageElement });
          const page = (data.get('page') as number) || 1;
          renderPdfPage(pdfUrl, page)
            .then(canvas => {
              node.image(canvas);
              node.getLayer?.()?.batchDraw();
            })
            .catch(err => console.error('[whiteboard] PDF页渲染失败', pdfUrl, page, err));
          return node;
        }
        const img = new Image();
        const node = new Konva.Image({ ...base, image: img });
        img.onload = () => {
          node.getLayer?.()?.batchDraw();
        };
        img.src = data.get('url') as string;
        return node;
      }
      default:
        return null;
    }
  }

  clearCurrentPage() {
    this.layer.destroyChildren();
    this.nodeMap.clear();
    this.layer.batchDraw();
  }

  addImageToLayer(imgUrl: string, x: number, y: number, maxWidth: number) {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        const ratio = maxWidth / w;
        w = maxWidth;
        h = h * ratio;
      }
      const kImg = new Konva.Image({ x, y, width: w, height: h, image: img });
      this.layer.add(kImg);
      this.layer.batchDraw();
    };
    img.src = imgUrl;
  }

  resize(width: number, height: number) {
    this.stage.setSize({ width, height });
    this.layer.batchDraw();
  }

  getStage(): Konva.Stage {
    return this.stage;
  }

  destroy() {
    this.stage.destroy();
  }
}
