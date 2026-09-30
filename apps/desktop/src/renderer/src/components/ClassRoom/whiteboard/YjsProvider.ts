// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { DEFAULT_TOOL, ToolState, FileItem, CursorData } from './types';

export class YjsProvider {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: any;
  toolState: Y.Map<any>;
  pages: Y.Array<Y.Map<any>>;
  currentPageIndex: Y.Map<number>;
  fileList: Y.Array<Y.Map<any>>;
  viewportOffset: Y.Map<any>;
  readOnly: boolean;

  constructor(
    roomId: string,
    userId: string,
    userName: string,
    userColor: string,
    onSessionClosed?: (kind: 'kicked' | 'expired') => void,
    readOnly = false
  ) {
    this.readOnly = readOnly;
    this.doc = new Y.Doc();
    this.toolState = this.doc.getMap('toolState');
    this.pages = this.doc.getArray('pages');
    this.currentPageIndex = this.doc.getMap('currentPageIndex');
    this.fileList = this.doc.getArray('fileList');
    this.viewportOffset = this.doc.getMap('viewportOffset');

    // 只读端不写初始工具状态：否则学生入会会用默认值覆盖教师正在使用的颜色/粗细
    if (!this.readOnly) {
      this.toolState.set('type', DEFAULT_TOOL.type);
      this.toolState.set('color', DEFAULT_TOOL.color);
      this.toolState.set('lineWidth', DEFAULT_TOOL.lineWidth);
      this.toolState.set('fontSize', DEFAULT_TOOL.fontSize);
      this.toolState.set('opacity', DEFAULT_TOOL.opacity);
    }

    const wsUrl = import.meta.env.VITE_YJS_WS || 'ws://localhost:8188/yjs';
    const token = localStorage.getItem('token') || '';
    this.provider = new WebsocketProvider(wsUrl, roomId, this.doc, {
      connect: true,
      // 关闭 lib0 BroadcastChannel 跨端同步：服务端 WS 已是唯一同步源，
      // bc 会在同进程内让同 roomId 的 provider 互相灌数据（测试互相污染）
      disableBc: true,
      params: { roomId, token },
    });

    // y-websocket only emits `closed` for terminal close codes (4400-4499):
    // 4401 = kicked by another login, 4402 = session expired/invalid.
    this.provider.on('closed', (event: { code: number; reason: string }) => {
      if (event.code === 4401) {
        onSessionClosed?.('kicked');
      } else if (event.code === 4402) {
        onSessionClosed?.('expired');
      }
    });

  // After sync completes, if pages is still empty (student joined before teacher),
  // create a default page. This avoids creating a local page that conflicts with
  // the teacher's synced page (different Y.Map IDs cause duplicate pages).
  this.provider.once('synced', () => {
    if (!this.readOnly && this.pages.length === 0) {
      this.doc.transact(() => {
        const page = new Y.Map();
        page.set('id', `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        page.set('name', 'Page 1');
        page.set('visible', true);
        page.set('elements', new Y.Array());
        this.pages.push([page]);
        this.currentPageIndex.set('index', 0);
      });
    }
  });

  this.awareness = this.provider.awareness;
  this.awareness.setLocalStateField('user', { id: userId, name: userName, color: userColor });
}

onSynced(cb: () => void) {
  this.provider.on('synced', cb);
}

  getCurrentPageIndex(): number {
    return this.currentPageIndex.get('index') || 0;
  }

  setCurrentPageIndex(index: number) {
    if (this.readOnly) return;
    this.currentPageIndex.set('index', index);
  }

  getViewportOffset(): { x: number; y: number } {
    return { x: this.viewportOffset.get('x') || 0, y: this.viewportOffset.get('y') || 0 };
  }

  setViewportOffset(x: number, y: number) {
    if (this.readOnly) return;
    this.viewportOffset.set('x', x);
    this.viewportOffset.set('y', y);
  }

  getViewportZoom(): number {
    return (this.viewportOffset.get('zoom') as number) || 100;
  }

  setViewportZoom(zoom: number) {
    if (this.readOnly) return;
    this.viewportOffset.set('zoom', zoom);
  }

  // 教师端 stage 尺寸：学生端据此把取景框按 contain 比例适配到本地屏幕
  setViewportStageSize(w: number, h: number) {
    if (this.readOnly) return;
    // 值未变不重写：平移拖动每次都经 syncViewportToYjs 带入，避免无谓更新
    if (this.viewportOffset.get('sw') !== w) this.viewportOffset.set('sw', w);
    if (this.viewportOffset.get('sh') !== h) this.viewportOffset.set('sh', h);
  }

  getViewportStageSize(): { w: number; h: number } | null {
    const w = this.viewportOffset.get('sw') as number | undefined;
    const h = this.viewportOffset.get('sh') as number | undefined;
    if (!w || !h) return null;
    return { w, h };
  }

  getPages(): Y.Array<Y.Map<any>> {
    return this.pages;
  }

  addPage(): string {
    if (this.readOnly) return '';
    const newIndex = this.pages.length;
    const page = new Y.Map();
    // 同一毫秒内的多次调用必须产生不同 id（pages.observe 按 id 去重，重复会导致丢层）
    const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    page.set('id', pageId);
    page.set('name', `Page ${newIndex + 1}`);
    page.set('visible', true);
    page.set('elements', new Y.Array());
    this.doc.transact(() => {
      this.pages.push([page]);
      this.currentPageIndex.set('index', newIndex);
    });
    return pageId;
  }

  removePage(index: number): number {
    if (this.readOnly) return this.getCurrentPageIndex();
    if (this.pages.length <= 1) return this.getCurrentPageIndex();
    let newIndex = 0;
    this.doc.transact(() => {
      this.pages.delete(index, 1);
      newIndex = Math.min(index, this.pages.length - 1);
      this.currentPageIndex.set('index', newIndex);
    });
    return newIndex;
  }

  getActiveElements(): Y.Array<any> | null {
    const idx = this.getCurrentPageIndex();
    const page = this.pages.get(idx);
    if (!page) return null;
    return page.get('elements') as Y.Array<any>;
  }

  getCurrentPageId(): string {
    const idx = this.getCurrentPageIndex();
    const page = this.pages.get(idx);
    return page ? (page.get('id') as string) : '';
  }

  getElementsAtPage(index: number): Y.Array<any> | null {
    const page = this.pages.get(index);
    if (!page) return null;
    return page.get('elements') as Y.Array<any>;
  }

  setToolState(state: Partial<ToolState>) {
    if (this.readOnly) return;
    this.doc.transact(() => {
      if (state.type !== undefined) this.toolState.set('type', state.type);
      if (state.color !== undefined) this.toolState.set('color', state.color);
      if (state.lineWidth !== undefined) this.toolState.set('lineWidth', state.lineWidth);
      if (state.fontSize !== undefined) this.toolState.set('fontSize', state.fontSize);
      if (state.opacity !== undefined) this.toolState.set('opacity', state.opacity);
    });
  }

  getToolState(): ToolState {
    return {
      type: (this.toolState.get('type') as ToolState['type']) || 'cur',
      color: (this.toolState.get('color') as string) || '#000000',
      lineWidth: (this.toolState.get('lineWidth') as number) || 1,
      fontSize: (this.toolState.get('fontSize') as number) || 14,
      opacity: (this.toolState.get('opacity') as number) ?? 1,
    };
  }

  addShape(shapeData: any) {
    if (this.readOnly) return;
    const elements = this.getActiveElements();
    if (elements) {
      const map = new Y.Map();
      Object.entries(shapeData).forEach(([k, v]) => map.set(k, v));
      this.doc.transact(() => { elements.push([map]); });
    }
  }

  removeLastElement(): boolean {
    if (this.readOnly) return false;
    const elements = this.getActiveElements();
    if (!elements || elements.length === 0) return false;
    this.doc.transact(() => { elements.delete(elements.length - 1, 1); });
    return true;
  }

  findElementIndex(id: string): number {
    const elements = this.getActiveElements();
    if (!elements) return -1;
    return elements.toArray().findIndex((m: any) => m.get('id') === id);
  }

  updateElement(id: string, attrs: Record<string, any>): boolean {
    if (this.readOnly) return false;
    const idx = this.findElementIndex(id);
    if (idx < 0) return false;
    const map = this.getActiveElements()!.get(idx);
    this.doc.transact(() => {
      Object.entries(attrs).forEach(([k, v]) => map.set(k, v));
    });
    return true;
  }

  // 删除元素上的指定字段（undo 在 before/after 键集不同时清理旧形态字段，如圆↔椭圆的 radius/radiusX）
  deleteElementKeys(id: string, keys: string[]): boolean {
    if (this.readOnly) return false;
    const idx = this.findElementIndex(id);
    if (idx < 0) return false;
    const map = this.getActiveElements()!.get(idx);
    this.doc.transact(() => {
      keys.forEach(k => { if (map.has(k)) map.delete(k); });
    });
    return true;
  }

  removeElement(id: string): number {
    if (this.readOnly) return -1;
    const idx = this.findElementIndex(id);
    if (idx < 0) return -1;
    this.doc.transact(() => { this.getActiveElements()!.delete(idx, 1); });
    return idx;
  }

  insertElement(index: number, shapeData: Record<string, any>): boolean {
    if (this.readOnly) return false;
    const elements = this.getActiveElements();
    if (!elements) return false;
    const map = new Y.Map();
    Object.entries(shapeData).forEach(([k, v]) => map.set(k, v));
    this.doc.transact(() => {
      elements.insert(Math.max(0, Math.min(index, elements.length)), [map]);
    });
    return true;
  }

  addFileItem(item: FileItem) {
    if (this.readOnly) return;
    const map = new Y.Map();
    map.set('filename', item.filename);
    map.set('filext', item.filext);
    map.set('filesize', item.filesize);
    map.set('fileid', item.fileid);
    if (item.fileurl) map.set('fileurl', item.fileurl);
    this.doc.transact(() => { this.fileList.push([map]); });
  }

  removeFileItem(index: number) {
    if (this.readOnly) return;
    this.fileList.delete(index, 1);
  }

  renameFileItem(index: number, name: string) {
    if (this.readOnly) return;
    const item = this.fileList.get(index);
    if (item) item.set('filename', name);
  }

  setFileItemId(index: number, fileid: string) {
    if (this.readOnly) return;
    const item = this.fileList.get(index);
    if (item) item.set('fileid', fileid);
  }

  getFileList(): FileItem[] {
    return this.fileList.toArray().map((m: any) => ({
      filename: m.get('filename'),
      filext: m.get('filext'),
      filesize: m.get('filesize'),
      fileid: m.get('fileid') || '',
      fileurl: m.get('fileurl') || '',
    }));
  }

  updateCursor(cursor: CursorData) {
    this.awareness.setLocalStateField('cursor', cursor);
  }

  // 激光笔：瞬时广播（awareness，不进 Yjs 文档/undo 栈），仅教师可用
  setLaser(x: number, y: number) {
    if (this.readOnly) return;
    this.awareness.setLocalStateField('laser', { x, y });
  }

  setLaserOff() {
    this.awareness.setLocalStateField('laser', null);
  }

  destroy() {
    this.awareness.setLocalStateField('laser', null);
    this.awareness.setLocalStateField('cursor', null);
    this.awareness.setLocalStateField('user', null);
    this.provider.disconnect();
    this.doc.destroy();
  }
}
