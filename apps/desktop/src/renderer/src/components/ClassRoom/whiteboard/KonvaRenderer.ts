/* eslint-disable @typescript-eslint/no-explicit-any */
import Konva from 'konva';
import * as Y from 'yjs';
import { uid } from '@yunyan-live/utils';
import { renderPdfPage } from './pdfAsset';
import { ERASER_WIDTH_MULT, HIT_STROKE_MIN, isElementType } from './types';

/** 点到线段距离（F4.1 橡皮按元素命中判定） */
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// 远端光标尾迹各帧透明度（索引 0=最旧 … 末=上一帧，渐亮）；数组长度即尾迹帧数（F7.1 写死 5 帧）
const CURSOR_TRAIL_ALPHA = [0.08, 0.16, 0.24, 0.32, 0.4];

export class KonvaRenderer {
  stage: Konva.Stage;
  layer: Konva.Layer;
  // 绘制预览专用层：与当前页 layer 同步视口变换（预览坐标存层局部坐标，
  // 任意缩放/平移下位置与尺寸和最终图形一致；不进 layers 列表，不参与翻页/绑定）
  previewLayer: Konva.Layer;
  tempLayer: Konva.Layer;
  // 激光红点专用层：与 previewLayer 同步视口变换（教师跟指/远端广播共用单点，
  // 层局部坐标；不进 layers 列表，不参与翻页/绑定）
  laserLayer: Konva.Layer;
  // 远端光标专用层：与 previewLayer 同步视口变换（层局部坐标；z 序高于笔迹、低于激光）
  cursorLayer: Konva.Layer;
  private laserDot: Konva.Circle | null = null;
  private cursorDot: Konva.Circle | null = null;
  private cursorLabel: Konva.Text | null = null;
  private cursorTrailDots: Konva.Circle[] = [];
  // 尾迹历史位置（索引 0=最旧 … 末=上一帧点位），null=无帧；cursorPlaced=false 的首帧不挤入历史
  private cursorTrailPos: Array<{ x: number; y: number } | null> = [];
  private cursorPlaced = false;
  private layers: Konva.Layer[] = [];
  private layerMap = new Map<number, Konva.Layer>();
  private nodeMap = new Map<string, Konva.Node>();
  private zoomLevel = 100;
  private viewX = 0;
  private viewY = 0;
  private selectEnabled = false;
  private selectedId: string | null = null;
  private transformer: Konva.Transformer | null = null;
  private gesturing = false;
  private pendingBind: Y.Array<any> | null = null;
  // 导出实例专用：http 图片挂 crossorigin，导出读像素才不被跨域污染（展示路径不加，避免旧服务端反代下图片加载失败）
  private exportMode = false;
  pageIds: string[] = [];
  onShapeClick?: (id: string) => void;
  onShapeDblClick?: (id: string) => void;
  onShapeDragEnd?: (id: string, x: number, y: number) => void;
  onShapeTransformEnd?: (id: string, attrs: Record<string, any>) => void;
  // 手势（拖动/缩放）期间收到的刷新延后到手势结束，避免销毁正在操作的节点
  onRefreshRequest?: () => void;

  constructor(container: HTMLElement, opts?: { exportMode?: boolean }) {
    this.exportMode = opts?.exportMode ?? false;
    this.stage = new Konva.Stage({
      container: container as HTMLDivElement,
      width: container.clientWidth,
      height: container.clientHeight
    });
    this.layer = new Konva.Layer();
    this.previewLayer = new Konva.Layer();
    this.tempLayer = new Konva.Layer();
    this.cursorLayer = new Konva.Layer();
    this.laserLayer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.add(this.previewLayer);
    this.stage.add(this.tempLayer);
    this.stage.add(this.cursorLayer);
    this.stage.add(this.laserLayer);
    this.layers = [this.layer];
    this.layerMap.set(0, this.layer);
  }

  addPage(index: number, pageId?: string): Konva.Layer {
    if (index < this.layers.length && index >= this.pageIds.length) {
      const existingLayer = this.layers[index]!;
      this.pageIds.splice(index, 0, pageId || uid('local_'));
      this.rebuildLayerMap();
      return existingLayer;
    }
    const newLayer = new Konva.Layer();
    this.stage.add(newLayer);
    newLayer.hide();
    this.layers.splice(index, 0, newLayer);
    this.pageIds.splice(index, 0, pageId || uid('local_'));
    this.layerMap.set(index, newLayer);
    this.rebuildLayerMap();
    return newLayer;
  }

  showPage(index: number) {
    this.layers.forEach((l, i) => {
      if (i === index) l.show();
      else l.hide();
    });
    this.layer = this.layers[index]!;
    // 每页是独立 Layer（scale/x/y 各自独立）——切层后重应用全局视图，
    // 跨页缩放/平移保持一致（zoomLevel 显示本来就不随翻页重置）
    this.layer.scaleX(this.zoomLevel / 100);
    this.layer.scaleY(this.zoomLevel / 100);
    this.layer.x(this.viewX);
    this.layer.y(this.viewY);
    this.previewLayer.scaleX(this.zoomLevel / 100);
    this.previewLayer.scaleY(this.zoomLevel / 100);
    this.previewLayer.x(this.viewX);
    this.previewLayer.y(this.viewY);
    this.cursorLayer.scaleX(this.zoomLevel / 100);
    this.cursorLayer.scaleY(this.zoomLevel / 100);
    this.cursorLayer.x(this.viewX);
    this.cursorLayer.y(this.viewY);
    this.laserLayer.scaleX(this.zoomLevel / 100);
    this.laserLayer.scaleY(this.zoomLevel / 100);
    this.laserLayer.x(this.viewX);
    this.laserLayer.y(this.viewY);
    this.clearSelection();
    this.previewLayer.moveToTop();
    this.tempLayer.moveToTop();
    this.cursorLayer.moveToTop();
    this.laserLayer.moveToTop();
    this.rebuildLayerMap();
    this.stage.batchDraw();
  }

  // 全局平移视图（记录值供 showPage 重应用；学生端由 viewportOffset 观察器调用）
  setViewport(x: number, y: number) {
    this.viewX = x;
    this.viewY = y;
    this.layer.x(x);
    this.layer.y(y);
    this.previewLayer.x(x);
    this.previewLayer.y(y);
    this.cursorLayer.x(x);
    this.cursorLayer.y(y);
    this.laserLayer.x(x);
    this.laserLayer.y(y);
    this.layer.batchDraw();
    this.previewLayer.batchDraw();
    this.cursorLayer.batchDraw();
    this.laserLayer.batchDraw();
  }

  getView(): { x: number; y: number } {
    return { x: this.viewX, y: this.viewY };
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
    this.previewLayer.scaleX(scale);
    this.previewLayer.scaleY(scale);
    this.cursorLayer.scaleX(scale);
    this.cursorLayer.scaleY(scale);
    this.laserLayer.scaleX(scale);
    this.laserLayer.scaleY(scale);
    this.layer.batchDraw();
    this.previewLayer.batchDraw();
    this.cursorLayer.batchDraw();
    this.laserLayer.batchDraw();
    // F1.1：缩放变化 → 公式按新过采样重栅格（5.7.1 实测 S=clamp(2×zoom,1,8)，防抖合并连续缩放）
    this.scheduleFormulaRasterRefresh();
  }

  // 激光红点（层局部坐标）：x=null 熄灭。与 previewLayer 同视口，任意缩放/平移下位置一致
  setLaserPoint(x: number | null, y = 0) {
    if (!this.laserDot) {
      this.laserDot = new Konva.Circle({
        radius: 9,
        fill: '#ff3b30',
        stroke: '#ffffff',
        strokeWidth: 2,
        shadowBlur: 8,
        shadowColor: 'rgba(255, 59, 48, 0.8)',
        listening: false
      });
      this.laserLayer.add(this.laserDot);
    }
    if (x === null) {
      this.laserDot.hide();
    } else {
      this.laserDot.x(x);
      this.laserDot.y(y);
      this.laserDot.show();
    }
    this.laserLayer.batchDraw();
  }

  // 远端光标（层局部坐标）：姓名标签 + 光标点 + 5 帧渐隐尾迹，与激光共用视口镜像。
  // 颜色/名字按会话常量在首帧构造（教师 color/name 不变）；每次调用恢复标签可见，
  // 静止 3s 的淡出由 WhiteBoard 定时器调 setRemoteCursorLabel(false)
  setRemoteCursor(x: number, y: number, color: string, name: string) {
    if (!this.cursorDot) {
      // 节点序：5 尾迹（最旧→最新）→ 光标点 → 姓名标签（标签最上）
      for (let i = 0; i < CURSOR_TRAIL_ALPHA.length; i++) {
        const t = new Konva.Circle({ radius: 5, fill: color, opacity: 0, listening: false });
        t.hide();
        this.cursorTrailDots.push(t);
        this.cursorTrailPos.push(null);
        this.cursorLayer.add(t);
      }
      this.cursorDot = new Konva.Circle({
        radius: 6,
        fill: color,
        stroke: '#ffffff',
        strokeWidth: 1.5,
        listening: false
      });
      this.cursorLayer.add(this.cursorDot);
      this.cursorLabel = new Konva.Text({
        text: name,
        fontSize: 12,
        fontStyle: 'bold',
        fill: color,
        stroke: '#ffffff',
        strokeWidth: 3,
        lineJoin: 'round',
        x: x + 12,
        y: y + 12,
        listening: false
      });
      this.cursorLayer.add(this.cursorLabel);
    }
    const prev = { x: this.cursorDot.x(), y: this.cursorDot.y() };
    if (this.cursorPlaced && (prev.x !== x || prev.y !== y)) {
      // 尾迹：上一帧点位挤入历史，超 5 帧丢最旧；按旧→新赋透明度渐亮
      this.cursorTrailPos.shift();
      this.cursorTrailPos.push(prev);
      for (let i = 0; i < CURSOR_TRAIL_ALPHA.length; i++) {
        const p = this.cursorTrailPos[i];
        const node = this.cursorTrailDots[i]!;
        if (p) {
          node.x(p.x);
          node.y(p.y);
          node.opacity(CURSOR_TRAIL_ALPHA[i]!);
          node.show();
        } else {
          node.opacity(0);
          node.hide();
        }
      }
    }
    this.cursorPlaced = true;
    this.cursorDot.x(x);
    this.cursorDot.y(y);
    this.cursorDot.show();
    if (this.cursorLabel) {
      this.cursorLabel.x(x + 12);
      this.cursorLabel.y(y + 12);
      this.cursorLabel.opacity(1);
      this.cursorLabel.show();
    }
    this.cursorLayer.batchDraw();
  }

  // 姓名标签显隐（F7.1：静止 3s 后 false 淡出，新光标帧由 setRemoteCursor 恢复）
  setRemoteCursorLabel(show: boolean) {
    if (!this.cursorLabel) return;
    if (show) this.cursorLabel.show();
    this.cursorLabel.opacity(show ? 1 : 0);
    this.cursorLayer.batchDraw();
  }

  // 清除远端光标（peer 离开 / cursor:null）：隐藏全部节点并清空尾迹历史，防幽灵光标
  clearRemoteCursor() {
    this.cursorDot?.hide();
    this.cursorLabel?.hide();
    this.cursorTrailDots.forEach(n => n.hide());
    this.cursorTrailPos.fill(null);
    this.cursorPlaced = false;
    this.cursorLayer.batchDraw();
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
      this.setViewport(0, 0);
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
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
    // 全览平移写 layer 而非 stage：stage 必须保持恒等变换，否则 Konva Transformer 的
    // 全链绝对坐标与局部坐标两套约定错位，缩放手柄提交的 x/y 会偏移一个 stage 位移量
    this.setViewport(
      (this.stage.width() - contentW * scale) / 2 - minX * scale,
      (this.stage.height() - contentH * scale) / 2 - minY * scale
    );
  }

  getZoom(): number {
    return this.zoomLevel;
  }

  getNodeCount(): number {
    return this.nodeMap.size;
  }

  bindElements(elements: Y.Array<any>) {
    // 手势进行中不销毁重建（会中断拖动/缩放并触发 Konva null getStage 崩溃），先挂起
    if (this.gesturing) {
      this.pendingBind = elements;
      return;
    }
    this.pendingBind = null;
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
    node.off('click dblclick dragstart dragend transformstart transformend');
    if (!this.selectEnabled) return;
    node.draggable(true);
    node.on('click', () => this.onShapeClick?.(id));
    node.on('dblclick', () => this.onShapeDblClick?.(id));
    node.on('dragstart', () => {
      this.gesturing = true;
    });
    node.on('dragend', () => {
      this.gesturing = false;
      this.onShapeDragEnd?.(id, node.x(), node.y());
      this.flushPendingBind();
    });
    node.on('transformstart', () => {
      this.gesturing = true;
    });
    node.on('transformend', () => {
      const attrs = this.bakeTransform(node);
      node.scaleX(1);
      node.scaleY(1);
      this.gesturing = false;
      this.onShapeTransformEnd?.(id, attrs);
      this.flushPendingBind();
    });
  }

  private flushPendingBind() {
    if (!this.pendingBind) return;
    this.pendingBind = null;
    this.onRefreshRequest?.();
  }

  selectNode(id: string): boolean {
    if (!this.selectEnabled) return false;
    const node = this.nodeMap.get(id);
    if (!node) return false;
    this.selectedId = id;
    // tempLayer 的预览清理（destroyChildren）会连带销毁 transformer 但引用残留，
    // 失效判定后重建，否则选中框/手柄永久消失
    if (this.transformer && !this.transformer.getLayer()) this.transformer = null;
    if (!this.transformer) {
      this.transformer = new Konva.Transformer({ rotateEnabled: false, padding: 4 });
      this.tempLayer.add(this.transformer);
    }
    // 自由缩放（圆可拉成椭圆）；Konva 默认 shiftBehavior='default' → 按住 Shift 自动约束比例
    this.transformer.keepRatio(false);
    this.transformer.nodes([node]);
    this.tempLayer.batchDraw();
    return true;
  }

  clearSelection() {
    if (this.transformer && this.transformer.getLayer()) this.transformer.nodes([]);
    this.selectedId = null;
    this.tempLayer.batchDraw();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  /** F4.1 橡皮按元素命中：仅折线类（Line/Arrow，含白盖与荧光笔迹），自顶向下逐段判定，
   *  命中条件为点到线段距离 ≤ 笔画半宽 + 橡皮半径（重叠即整笔擦除的入口） */
  hitStroke(x: number, y: number, radius: number): string | null {
    const entries = [...this.nodeMap.entries()].reverse();
    for (const [id, node] of entries) {
      let cls = node.getClassName();
      let target: any = node;
      // F3.1：受力箭头（Group）经内部 Arrow 杆身命中，偏移取 Group 自身
      if (cls === 'Group') {
        const arrow = (
          node as unknown as {
            getChildren: () => { find: (fn: (c: unknown) => boolean) => unknown };
          }
        )
          .getChildren()
          .find(c => (c as { getClassName: () => string }).getClassName() === 'Arrow');
        if (!arrow) continue;
        target = arrow;
        cls = 'Arrow';
      }
      if (cls !== 'Line' && cls !== 'Arrow') continue;
      const n = target as any;
      const pts: number[] = n.points ? n.points() : [];
      const tol = ((n.strokeWidth ? Number(n.strokeWidth()) : 0) || 0) / 2 + radius;
      const nx = Number(node.x()) || 0;
      const ny = Number(node.y()) || 0;
      if (pts.length >= 4) {
        for (let i = 0; i + 3 < pts.length; i += 2) {
          const d = distToSeg(
            x,
            y,
            pts[i]! + nx,
            pts[i + 1]! + ny,
            pts[i + 2]! + nx,
            pts[i + 3]! + ny
          );
          if (d <= tol) return id;
        }
      } else if (pts.length >= 2 && Math.hypot(x - (pts[0]! + nx), y - (pts[1]! + ny)) <= tol) {
        return id;
      }
    }
    return null;
  }

  // 把 transformer 施加的 scale 烘焙进节点属性（Yjs 只存绝对属性）
  private bakeTransform(node: any): Record<string, any> {
    const sx = Number(node.scaleX()) || 1;
    const sy = Number(node.scaleY()) || 1;
    const attrs: Record<string, any> = { x: Number(node.x()) || 0, y: Number(node.y()) || 0 };
    if (sx === 1 && sy === 1) return attrs;
    const cls = node.getClassName ? node.getClassName() : '';
    if (cls === 'Circle') {
      const r = Number(node.radius()) || 0;
      if (sx === sy) {
        attrs.radius = r * sx;
      } else {
        // 非等比缩放 → 转为椭圆字段（一旦变椭圆永远椭圆，避免 radius 残留歧义）
        attrs.radiusX = r * sx;
        attrs.radiusY = r * sy;
      }
    } else if (cls === 'Ellipse') {
      // 椭圆恒写 radiusX/radiusY（即便等比），维持「椭圆恒椭圆」模型
      attrs.radiusX = (Number(node.radiusX()) || 0) * sx;
      attrs.radiusY = (Number(node.radiusY()) || 0) * sy;
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
    const rawType: unknown = data.get('type');
    // 显式未知分支：未注册类型（历史脏数据/未来新增）不进工厂，也不静默误入 default
    if (!isElementType(rawType)) return null;
    const type = rawType;
    const opacity = data.get('opacity') ?? 1;
    switch (type) {
      case 'brush':
      case 'eraser': {
        const strokeWidth =
          ((data.get('lineWidth') as number) || 1) * (type === 'eraser' ? ERASER_WIDTH_MULT : 1);
        // F4.1 荧光笔：blend=multiply 走 Konva 节点属性（场景绘制与 toDataURL 导出同源生效）
        const blend = data.get('blend');
        return new Konva.Line({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          points: (data.get('points') as number[]) || [],
          stroke: type === 'eraser' ? '#ffffff' : (data.get('color') as string),
          strokeWidth,
          // hit 图按 hitStrokeWidth 生成（auto = strokeWidth）：细笔迹须抬下限，选择器才点得中
          hitStrokeWidth: Math.max(strokeWidth, HIT_STROKE_MIN),
          lineCap: 'round',
          lineJoin: 'round',
          tension: 0.5,
          opacity,
          ...(blend === 'multiply' ? { globalCompositeOperation: 'multiply' } : {})
        });
      }
      case 'rect': {
        const strokeWidth = data.get('lineWidth') || 1;
        return new Konva.Rect({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          width: data.get('width') || 0,
          height: data.get('height') || 0,
          stroke: data.get('color') || '#000',
          strokeWidth,
          hitStrokeWidth: Math.max(strokeWidth, HIT_STROKE_MIN),
          fill: data.get('fill') || undefined,
          opacity
        });
      }
      case 'circle': {
        const strokeWidth = (data.get('lineWidth') as number) || 1;
        const base = {
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          stroke: data.get('color') || '#000',
          strokeWidth,
          hitStrokeWidth: Math.max(strokeWidth, HIT_STROKE_MIN),
          fill: data.get('fill') || undefined,
          opacity
        };
        const rx = data.get('radiusX');
        const ry = data.get('radiusY');
        // 有 radiusX/radiusY 即椭圆（优先判定，正圆只存 radius）
        if (rx !== undefined && rx !== null) {
          return new Konva.Ellipse({ ...base, radiusX: Number(rx) || 0, radiusY: Number(ry) || 0 });
        }
        return new Konva.Circle({ ...base, radius: data.get('radius') || 0 });
      }
      case 'arrow': {
        const strokeWidth = (data.get('lineWidth') as number) || 1;
        return new Konva.Arrow({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          points: (data.get('points') as number[]) || [],
          stroke: data.get('color') || '#000',
          strokeWidth,
          hitStrokeWidth: Math.max(strokeWidth, HIT_STROKE_MIN),
          fill: data.get('color') || '#000',
          opacity
        });
      }
      // F3.1 复合单元素：Group = 箭头杆身 + 标签（单 Yjs 元素/单节点，选择/移动/撤销天然成对）
      case 'force-arrow': {
        const strokeWidth = (data.get('lineWidth') as number) || 1;
        const color = data.get('color') || '#000';
        const points = (data.get('points') as number[]) || [];
        const label = String(data.get('label') ?? '');
        const group = new Konva.Group({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          opacity
        });
        group.add(
          new Konva.Arrow({
            points,
            stroke: color,
            fill: color,
            strokeWidth,
            hitStrokeWidth: Math.max(strokeWidth, HIT_STROKE_MIN)
          })
        );
        if (label) {
          const mx = ((points[0] as number) || 0) + ((points[2] as number) || 0);
          const my = ((points[1] as number) || 0) + ((points[3] as number) || 0);
          group.add(
            new Konva.Text({
              x: mx / 2 + 6,
              y: my / 2 - 18,
              text: label,
              fontSize: 16,
              fill: color
            })
          );
        }
        return group;
      }
      case 'line': {
        const strokeWidth = (data.get('lineWidth') as number) || 1;
        return new Konva.Line({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          points: (data.get('points') as number[]) || [],
          stroke: data.get('color') || '#000',
          strokeWidth,
          hitStrokeWidth: Math.max(strokeWidth, HIT_STROKE_MIN),
          lineCap: 'round',
          lineJoin: 'round',
          opacity
        });
      }
      case 'text':
        return new Konva.Text({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          text: data.get('text') || '',
          fontSize: data.get('fontSize') || 14,
          fill: data.get('color') || '#000',
          opacity
        });
      case 'formula': {
        const latex = String(data.get('latex') ?? '');
        const color = String(data.get('color') || '#000000');
        const node = new Konva.Image({
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          width: data.get('width') || 0,
          height: data.get('height') || 0,
          image: null as unknown as HTMLCanvasElement,
          opacity
        });
        // 自定义属性：latex 供缩放重栅格识别公式节点（Image 类通用），formulaColor 供换色重栅格
        node.setAttr('latex', latex);
        node.setAttr('formulaColor', color);
        this.rasterizeFormulaNode(node, latex, color);
        return node;
      }
      case 'ppt-image': {
        const pdfUrl = data.get('pdfUrl') as string | undefined;
        const base = {
          x: data.get('x') || 0,
          y: data.get('y') || 0,
          width: data.get('width') || 0,
          height: data.get('height') || 0
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
            height: data.get('height') || 0
          },
          data.get('url') as string,
          opacity
        );
      default: {
        // 穷尽性检查：ElementType 新增成员必须在此补齐分支（否则编译报错）
        const exhaustive: never = type;
        return exhaustive;
      }
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
    if (this.exportMode && /^https?:\/\//i.test(url)) img.crossOrigin = 'anonymous';
    img.src = url;
    return node;
  }

  // --- F1.1 公式光栅（5.7.1 B1 路线）：懒加载 katex+html2canvas 独立 chunk ---
  private formulaRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** 过采样系数（5.7.1 实测 S=clamp(2×zoom,1,8)）。此处内联而非 import formulaRaster 的
   *  formulaOversample：静态引用会把 katex/html2canvas 拖进主包，破坏懒加载 chunk 边界 */
  private formulaScale(): number {
    return Math.max(1, Math.min(8, 2 * (this.zoomLevel / 100)));
  }

  /** 单节点光栅化：按当前缩放过采样建位图；节点已随重建销毁则丢弃过期结果。
   *  width 未落库（0）时采纳自然尺寸，保证远端首绘与本地一致 */
  private rasterizeFormulaNode(node: Konva.Image, latex: string, color: string): void {
    const scale = this.formulaScale();
    import('./formulaRaster')
      .then(({ rasterizeFormula }) => rasterizeFormula(latex, color, scale))
      .then(r => {
        const layer = node.getLayer();
        if (!layer) return;
        node.image(r.canvas);
        if (!(Number(node.width()) > 0)) {
          node.width(r.width);
          node.height(r.height);
        }
        layer.batchDraw();
      })
      .catch(err => console.error('[whiteboard] 公式光栅失败', latex, err));
  }

  private scheduleFormulaRasterRefresh(): void {
    if (this.formulaRefreshTimer) clearTimeout(this.formulaRefreshTimer);
    this.formulaRefreshTimer = setTimeout(() => {
      this.formulaRefreshTimer = null;
      void this.refreshFormulaRasters();
    }, 250);
  }

  /** 缩放后全量重栅格公式（S=clamp(2×zoom,1,8)，5.7.1：固定 S 高倍缩放发糊）。缓存按新 S
   *  换键，提交态共享的旧键光栅不作废 */
  private async refreshFormulaRasters(): Promise<void> {
    const scale = this.formulaScale();
    const targets: Array<{ node: Konva.Image; latex: string; color: string }> = [];
    this.nodeMap.forEach(node => {
      if (node.getClassName() !== 'Image') return;
      const latex = node.getAttr('latex');
      if (typeof latex !== 'string' || !latex) return;
      targets.push({
        node: node as Konva.Image,
        latex,
        color: String(node.getAttr('formulaColor') || '#000000')
      });
    });
    if (!targets.length) return;
    try {
      const mod = await import('./formulaRaster');
      await Promise.all(
        targets.map(async t => {
          try {
            const r = await mod.rasterizeFormula(t.latex, t.color, scale);
            const layer = t.node.getLayer();
            if (!layer) return;
            t.node.image(r.canvas);
            layer.batchDraw();
          } catch (err) {
            console.error('[whiteboard] 公式缩放重栅格失败', t.latex, err);
          }
        })
      );
    } catch (err) {
      console.error('[whiteboard] 公式渲染模块加载失败', err);
    }
  }

  // 导出管线专用：等待本层全部图片类节点就绪（HTML 图片加载完成 / ppt 的 PDF 页渲染落位）。
  // image 为 null = PDF 仍在渲染；complete=false = 图片加载中；naturalWidth=0 = 加载失败。
  // 任一失败或超时抛错（文案可直接展示），不静默产出缺底图的图。
  async whenImagesReady(timeoutMs = 15000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let pending = false;
      for (const node of this.layer.getChildren()) {
        const imageFn = (node as { image?: () => unknown }).image;
        if (typeof imageFn !== 'function') continue;
        const img = imageFn.call(node) as
          { complete?: boolean; naturalWidth?: number } | null | undefined;
        if (!img) {
          pending = true;
          continue;
        }
        if (img.complete === false) pending = true;
        else if (img.naturalWidth === 0) throw new Error('底图加载失败');
      }
      if (!pending) return;
      if (Date.now() > deadline) throw new Error('图片加载超时');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
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
    if (this.formulaRefreshTimer) clearTimeout(this.formulaRefreshTimer);
    this.formulaRefreshTimer = null;
    this.stage.destroy();
  }
}
