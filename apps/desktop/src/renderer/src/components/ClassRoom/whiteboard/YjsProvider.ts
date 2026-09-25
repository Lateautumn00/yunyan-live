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

  constructor(roomId: string, userId: string, userName: string, userColor: string) {
    this.doc = new Y.Doc();
    this.toolState = this.doc.getMap('toolState');
    this.pages = this.doc.getArray('pages');
    this.currentPageIndex = this.doc.getMap('currentPageIndex');
    this.fileList = this.doc.getArray('fileList');
    this.viewportOffset = this.doc.getMap('viewportOffset');

    this.toolState.set('type', DEFAULT_TOOL.type);
    this.toolState.set('color', DEFAULT_TOOL.color);
    this.toolState.set('lineWidth', DEFAULT_TOOL.lineWidth);
    this.toolState.set('fontSize', DEFAULT_TOOL.fontSize);
    this.toolState.set('opacity', DEFAULT_TOOL.opacity);

    const wsUrl = import.meta.env.VITE_YJS_WS || 'ws://localhost:8188/yjs';
    const token = localStorage.getItem('token') || '';
    this.provider = new WebsocketProvider(wsUrl, roomId, this.doc, {
      connect: true,
      params: { roomId, token },
    });

  // After sync completes, if pages is still empty (student joined before teacher),
  // create a default page. This avoids creating a local page that conflicts with
  // the teacher's synced page (different Y.Map IDs cause duplicate pages).
  this.provider.once('synced', () => {
    if (this.pages.length === 0) {
      this.doc.transact(() => {
        const page = new Y.Map();
        page.set('id', `page_${Date.now()}`);
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
    this.currentPageIndex.set('index', index);
  }

  getViewportOffset(): { x: number; y: number } {
    return { x: this.viewportOffset.get('x') || 0, y: this.viewportOffset.get('y') || 0 };
  }

  setViewportOffset(x: number, y: number) {
    this.viewportOffset.set('x', x);
    this.viewportOffset.set('y', y);
  }

  getPages(): Y.Array<Y.Map<any>> {
    return this.pages;
  }

  addPage(): string {
    const newIndex = this.pages.length;
    const page = new Y.Map();
    const pageId = `page_${Date.now()}`;
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
    const elements = this.getActiveElements();
    if (elements) {
      const map = new Y.Map();
      Object.entries(shapeData).forEach(([k, v]) => map.set(k, v));
      this.doc.transact(() => { elements.push([map]); });
    }
  }

  removeLastElement(): boolean {
    const elements = this.getActiveElements();
    if (!elements || elements.length === 0) return false;
    this.doc.transact(() => { elements.delete(elements.length - 1, 1); });
    return true;
  }

  addFileItem(item: FileItem) {
    const map = new Y.Map();
    map.set('filename', item.filename);
    map.set('filext', item.filext);
    map.set('filesize', item.filesize);
    map.set('fileid', item.fileid);
    this.doc.transact(() => { this.fileList.push([map]); });
  }

  removeFileItem(index: number) {
    this.fileList.delete(index, 1);
  }

  renameFileItem(index: number, name: string) {
    const item = this.fileList.get(index);
    if (item) item.set('filename', name);
  }

  getFileList(): FileItem[] {
    return this.fileList.toArray().map((m: any) => ({
      filename: m.get('filename'),
      filext: m.get('filext'),
      filesize: m.get('filesize'),
      fileid: m.get('fileid') || '',
    })).filter(item => !!item.fileid);
  }

  updateCursor(cursor: CursorData) {
    this.awareness.setLocalStateField('cursor', cursor);
  }

  destroy() {
    this.awareness.setLocalStateField('cursor', null);
    this.awareness.setLocalStateField('user', null);
    this.provider.disconnect();
    this.doc.destroy();
  }
}
