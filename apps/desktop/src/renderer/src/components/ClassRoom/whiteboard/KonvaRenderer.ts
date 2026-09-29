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
  private viewX = 0;
  private viewY = 0;
  private selectEnabled = false;
  private selectedId: string | null = null;
  private transformer: Konva.Transformer | null = null;
  pageIds: string[] = [];
  onShapeClick?: (id: string) => void;
  onShapeDragEnd?: (id: string, x: number, y: number) => void;
  onShapeTransformEnd?: (id: string, attrs: Record<string, any>) => void;

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
    // 每页是独立 Layer（scale/x/y 各自独立）——切层后重应用全局视图，
    // 跨页缩放/平移保持一致（zoomLevel 显示本来就不随翻页重置）
    this.layer.scaleX(this.zoomLevel / 100);
    this.layer.scaleY(this.zoomLevel / 100);
    this.layer.x(this.viewX);
    this.layer.y(this.viewY);
    this.clearSelection();
    this.tempLayer.moveToTop();
    this.rebuildLayerMap();
    this.stage.batchDraw();
  }

  // 全局平移视图（记录值供 showPage 重应用；学生端由 viewportOffset 观察器调用）
  setViewport(x: number, y: number) {
    this.viewX = x;
    this.viewY = y;
    this.layer.x(x);
    this.layer.y(y);
    this.layer.batchDraw();
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

  getNodeCount(): number {
    return this.nodeMap.size;
  }

  bindElements(elements: Y.Array<any>) {
    this.nodeMap.clear();
    this.layer.destroyChildren();
    elements.forEach((el: any) => {
      const node = this.createNode(el);
      if (node) {
        this.layer.add(node as any);
        const id = el.get('id') as string;
        this.nodeMap.set(id, node);
        this.wireNode(node, id);
      }
    });
    this.layer.batchDraw();
    if (this.selectedId) {
      if (this.selectEnabled && this.nodeMap.has(this.selectedId)) this.selectNode(this.selectedId);
      else this.clearSelection();
    }
  }

  // --- 选择器：cur 模式下节点可点选/拖动/缩放 ---
  setSelectMode(on: boolean) {
    this.selectEnabled = on;
    this.nodeMap.forEach((node, id) => this.wireNode(node, id));
    if (!on) this.clearSelection();
  }

  private wireNode(node: Konva.Node, id: string) {
    node.off('click dragend transformend');
    if (!this.selectEnabled) return;
    node.draggable(true);
    node.on('click', () => this.onShapeClick?.(id));
    node.on('dragend', () => this.onShapeDragEnd?.(id, node.x(), node.y()));
    node.on('transformend', () => {
      const attrs = this.bakeTransform(node);
      node.scaleX(1);
      node.scaleY(1);
      this.onShapeTransformEnd?.(id, attrs);
    });
  }

  selectNode(id: string): boolean {
    if (!this.selectEnabled) return false;
    const node = this.nodeMap.get(id);
    if (!node) return false;
    this.selectedId = id;
    if (!this.transformer) {
      this.transformer = new Konva.Transformer({ rotateEnabled: false, padding: 4 });
      this.tempLayer.add(this.transformer);
    }
    this.transformer.keepRatio(node.getClassName() === 'Circle');
    this.transformer.nodes([node]);
    this.tempLayer.batchDraw();
    return true;
  }

  clearSelection() {
    if (this.transformer) this.transformer.nodes([]);
    this.selectedId = null;
    this.tempLayer.batchDraw();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  // 把 transformer 施加的 scale 烘焙进节点属性（Yjs 只存绝对属性）
  private bakeTransform(node: any): Record<string, any> {
    const sx = Number(node.scaleX()) || 1;
    const sy = Number(node.scaleY()) || 1;
    const attrs: Record<string, any> = { x: Number(node.x()) || 0, y: Number(node.y()) || 0 };
    if (sx === 1 && sy === 1) return attrs;
    const cls = node.getClassName ? node.getClassName() : '';
    if (cls === 'Circle') {
      attrs.radius = (Number(node.radius()) || 0) * sx;
    } else if (cls === 'Text') {
      attrs.fontSize = Math.max(1, Math.round((Number(node.fontSize()) || 14) * sy));
    } else if (cls === 'Line' || cls === 'Arrow') {
      const pts: number[] = (node.points?.() as number[]) || [];
      attrs.points = pts.map((p, i) => (i % 2 === 0 ? p * sx : p * sy));
    } else {
      attrs.width = (Number(node.width()) || 0) * sx;
      attrs.height = (Number(node.height()) || 0) * sy;
    }
    return attrs;
  }

  private createNode(data: any): Konva.Node | null {
    const type = data.get('type');
    const opacity = data.get('opacity') ?? 1;
    switch (type) {
      case 'brush':
      case 'eraser':
        return new Konva.Line({
          x: data.get('x') || 0, y: data.get('y') || 0,
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
          x: data.get('x') || 0, y: data.get('y') || 0,
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
        return this.createImageNode(base, data.get('url') as string, opacity);
      }
      case 'image':
        return this.createImageNode(
          {
            x: data.get('x') || 0,
            y: data.get('y') || 0,
            width: data.get('width') || 0,
            height: data.get('height') || 0,
          },
          data.get('url') as string,
          opacity,
        );
      default:
        return null;
    }
  }

  private createImageNode(
    base: { x: number; y: number; width: number; height: number },
    url: string,
    opacity: number
  ): Konva.Image {
    const img = new Image();
    const node = new Konva.Image({ ...base, image: img, opacity });
    img.onload = () => {
      node.getLayer?.()?.batchDraw();
    };
    img.src = url;
    return node;
  }

  clearCurrentPage() {
    this.clearSelection();
    this.layer.destroyChildren();
    this.nodeMap.clear();
    this.layer.batchDraw();
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
