/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { uid } from '@yunyan-live/utils';
import { YjsClose } from '@yunyan-live/types';
import {
  DEFAULT_TOOL,
  ToolState,
  FileItem,
  CursorData,
  SpotlightState,
  MagnifierState,
  MediaProgressState
} from './types';

/** 快照状态帧（服务端 type 4，仅教师连接推送）：state 0=暂存已恢复 1=暂存失败重试中 */
export type SnapshotStatus = {
  state: 0 | 1;
  attempt: number;
};

/** lib0 Decoder 的最小 varuint 读取：桌面未直接依赖 lib0，按其公开字段 (arr, pos) 实现 */
function readVarUintFrom(d: { arr: Uint8Array; pos: number }): number {
  let num = 0;
  let mult = 1;
  while (d.pos < d.arr.length) {
    const r = d.arr[d.pos++] ?? 0;
    num += (r & 0x7f) * mult;
    if (r < 0x80) return num;
    mult *= 128;
  }
  return num;
}

export class YjsProvider {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: any;
  toolState: Y.Map<any>;
  pages: Y.Array<Y.Map<any>>;
  currentPageIndex: Y.Map<number>;
  fileList: Y.Array<Y.Map<any>>;
  viewportOffset: Y.Map<any>;
  undoManager: Y.UndoManager;
  readOnly: boolean;
  private snapshotStatusCbs: Array<(status: SnapshotStatus) => void> = [];
  /** F5.2b：调序事务给栈项打的页标记（stack-item-added 在事务收尾时消费） */
  private pendingMovePageId: string | null = null;

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

    // D5：板书撤销统一走 Y.UndoManager。scope=doc，靠 captureTransaction 白名单收窄到
    // 「pages 及其子孙（各页 elements）」——视口/工具态/翻页/课件登记的辅助写入不入栈；
    // captureTimeout=0 逐事务独立成项（与旧手写栈「每笔一档」一致，不按 500ms 合并）；
    // trackedOrigins 默认 {null} 只捕获本地写入，远端同步（origin=provider 实例）不入栈
    this.undoManager = new Y.UndoManager(this.doc, {
      captureTimeout: 0,
      captureTransaction: tr => {
        for (const t of tr.changedParentTypes.keys()) {
          if (t === this.pages) return true;
        }
        return false;
      }
    });
    // 记录操作发生页：undo/redo 后 UI 据此跳页；栈项在栈间移动时保留首次记录
    this.undoManager.on('stack-item-added', ({ stackItem }) => {
      if (!stackItem.meta.has('pageIndex')) {
        stackItem.meta.set('pageIndex', this.getCurrentPageIndex());
      }
      // F5.2b：调序后索引会漂移，补记页 id，jumpToUndoMeta 优先按 id 解析
      if (this.pendingMovePageId) {
        stackItem.meta.set('pageId', this.pendingMovePageId);
        this.pendingMovePageId = null;
      }
    });

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
      params: { roomId, token }
    });

    // y-websocket only emits `closed` for terminal close codes (4400-4499):
    // 4401 = kicked by another login, 4402 = session expired/invalid.
    this.provider.on('closed', (event: { code: number; reason: string }) => {
      if (event.code === YjsClose.SESSION_KICKED) {
        onSessionClosed?.('kicked');
      } else if (event.code === YjsClose.SESSION_INVALID) {
        onSessionClosed?.('expired');
      }
    });

    // 自定义 type=4 快照状态帧：messageHandlers 是实例副本（slice），可安全扩展；
    // 构造内同步注册，早于任何网络消息到达
    this.provider.messageHandlers[4] = (_encoder, decoder) => {
      const state = readVarUintFrom(decoder);
      const attempt = readVarUintFrom(decoder);
      const status: SnapshotStatus = {
        state: state as SnapshotStatus['state'],
        attempt
      };
      for (const cb of [...this.snapshotStatusCbs]) cb(status);
    };

    // After sync completes, if pages is still empty (student joined before teacher),
    // create a default page. This avoids creating a local page that conflicts with
    // the teacher's synced page (different Y.Map IDs cause duplicate pages).
    // y-websocket emits `sync`/`synced` together on each sync-state change;
    // `sync` is the typed event (ObservableV2). First change is always false→true.
    this.provider.once('sync', () => {
      if (!this.readOnly && this.pages.length === 0) {
        // origin=this：默认页为系统行为，不进撤销栈（trackedOrigins 只认 null）
        this.doc.transact(() => {
          const page = new Y.Map();
          page.set('id', uid('page_'));
          page.set('name', 'Page 1');
          page.set('visible', true);
          page.set('elements', new Y.Array());
          this.pages.push([page]);
          this.currentPageIndex.set('index', 0);
        }, this);
      }
    });

    this.awareness = this.provider.awareness;
    this.awareness.setLocalStateField('user', { id: userId, name: userName, color: userColor });
  }

  onSynced(cb: () => void) {
    // 每次同步状态变更都回调（含重连），与原 'synced' 行为一致
    this.provider.on('sync', () => cb());
  }

  /** 订阅快照状态帧（§4.9 F6.2 教师端横幅）；返回退订函数 */
  onSnapshotStatus(cb: (status: SnapshotStatus) => void): () => void {
    this.snapshotStatusCbs.push(cb);
    return () => {
      const i = this.snapshotStatusCbs.indexOf(cb);
      if (i >= 0) this.snapshotStatusCbs.splice(i, 1);
    };
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

  // 视口原子写：observe 在事务结束只触发一次，拿到完整快照。分开写会先触发一次半更新——
  // 观察器拿旧 x/y 回写本地视口，随后 getView 就把旧值存回地图（拖动被拽回原位）
  setViewportAll(v: { x: number; y: number; zoom: number; sw: number; sh: number }) {
    if (this.readOnly) return;
    this.doc.transact(() => {
      this.viewportOffset.set('x', v.x);
      this.viewportOffset.set('y', v.y);
      this.viewportOffset.set('zoom', v.zoom);
      if (this.viewportOffset.get('sw') !== v.sw) this.viewportOffset.set('sw', v.sw);
      if (this.viewportOffset.get('sh') !== v.sh) this.viewportOffset.set('sh', v.sh);
    });
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
    const pageId = uid('page_');
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

  /** F7.2：页级黑板深色底开关（写页 Map 字段，随整 doc UndoManager 可撤销） */
  setPageDark(index: number, dark: boolean): void {
    if (this.readOnly) return;
    const page = this.pages.get(index);
    if (page) page.set('dark', dark);
  }

  /** F7.2：读页级深色底；旧页缺 dark 字段按 false（前向兼容） */
  getPageDark(index: number): boolean {
    return this.pages.get(index)?.get('dark') === true;
  }

  /**
   * F5.2b：页调序（缩略图拖拽排序）。
   *
   * yjs 13.x 没有原生 move：把同一个 Y.Map delete 再 insert 会因 _prelimContent 已被
   * 清空而抛 TypeError，故必须整页深克隆（非 elements 字段直取 + 新 Y.Array 重建
   * elements 及其每个元素），再「删旧插新」放进同一事务：
   *  - 恰好触发一次 pages.observe 与一档 undo，一次回滚全恢复；
   *  - currentPageIndex 按位移算术跟页走（被搬的页落 to，区间内整体挪一格）；
   *  - 栈项 meta.pageId 记当前页 id，undo 后索引漂移也能跳回正确页。
   *
   * @param from 起始索引
   * @param to 目标索引（落位后的最终索引）
   */
  movePage(from: number, to: number): boolean {
    if (this.readOnly) return false;
    const total = this.pages.length;
    if (from === to) return false;
    if (from < 0 || from >= total || to < 0 || to >= total) return false;
    const src = this.pages.get(from);
    if (!src) return false;
    const clone = this.clonePage(src);
    this.doc.transact(() => {
      this.pages.delete(from, 1);
      this.pages.insert(to, [clone]);
      const cur = this.getCurrentPageIndex();
      let next = cur;
      if (cur === from) next = to;
      else if (cur > from && cur <= to) next = cur - 1;
      else if (cur >= to && cur < from) next = cur + 1;
      this.currentPageIndex.set('index', next);
      this.pendingMovePageId = this.getCurrentPageId();
    });
    this.pendingMovePageId = null; // 未被栈项消费也别漏到下一档
    return true;
  }

  /** 深拷贝一页（含 elements/scratchElements 子树），得到未集成到文档的新实例 */
  private clonePage(page: Y.Map<any>): Y.Map<any> {
    const copy = new Y.Map<any>();
    const deepCopy = (src: Y.Array<any> | undefined): Y.Array<any> => {
      const rebuilt = new Y.Array<any>();
      if (src && src.length) {
        const items = src.toArray().map(el => {
          const item = new Y.Map<any>();
          if (el instanceof Y.Map) el.forEach((v, k) => item.set(k, v));
          return item;
        });
        rebuilt.push(items);
      }
      return rebuilt;
    };
    page.forEach((v, k) => {
      // 子树需重建实例：Y.Array 集成过原页，直接 set 到新页会抛「已集成」错误
      if (k === 'elements' || k === 'scratchElements') return;
      copy.set(k, v);
    });
    copy.set('elements', deepCopy(page.get('elements') as Y.Array<any> | undefined));
    // scratch 懒建语义保持：原页没开过板则克隆页也不带字段
    if (page.has('scratchElements')) {
      copy.set(
        'scratchElements',
        deepCopy(page.get('scratchElements') as Y.Array<any> | undefined)
      );
    }
    return copy;
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

  // --- F7.4 板中板（scratch）：页级手写演算区，独立于 elements，随页保存 ---

  /** 读页 scratch 数组（懒建语义：没开过板的页无字段 → null） */
  getScratchAtPage(index: number): Y.Array<any> | null {
    const page = this.pages.get(index);
    if (!page) return null;
    return (page.get('scratchElements') as Y.Array<any>) ?? null;
  }

  /** 懒建页 scratch 数组（首开板时调用；只读端拒建） */
  ensureScratchAtPage(index: number): Y.Array<any> | null {
    if (this.readOnly) return null;
    const page = this.pages.get(index);
    if (!page) return null;
    let arr = page.get('scratchElements') as Y.Array<any> | undefined;
    if (!arr) {
      this.doc.transact(() => {
        page.set('scratchElements', new Y.Array<any>());
      });
      arr = page.get('scratchElements') as Y.Array<any>;
    }
    return arr;
  }

  /** 写一笔到当前页 scratch（只读端拒写；与 addShape 同构：Y.Map 逐字段） */
  addScratchElement(data: any) {
    if (this.readOnly) return;
    const arr = this.ensureScratchAtPage(this.getCurrentPageIndex());
    if (!arr) return;
    const map = new Y.Map();
    Object.entries(data).forEach(([k, v]) => map.set(k, v));
    this.doc.transact(() => {
      arr.push([map]);
    });
  }

  /** 页级开合字段：学生端经页观察器跟随（与 dark 同路径） */
  setScratchOpen(index: number, open: boolean): void {
    if (this.readOnly) return;
    const page = this.pages.get(index);
    if (!page) return;
    this.doc.transact(() => {
      page.set('scratchOpen', open);
    });
  }

  getScratchOpen(index: number): boolean {
    const page = this.pages.get(index);
    if (!page) return false;
    return page.get('scratchOpen') === true;
  }

  setToolState(state: Partial<ToolState>) {
    if (this.readOnly) return;
    this.doc.transact(() => {
      if (state.type !== undefined) this.toolState.set('type', state.type);
      if (state.color !== undefined) this.toolState.set('color', state.color);
      if (state.lineWidth !== undefined) this.toolState.set('lineWidth', state.lineWidth);
      if (state.fontSize !== undefined) this.toolState.set('fontSize', state.fontSize);
      if (state.opacity !== undefined) this.toolState.set('opacity', state.opacity);
      if (state.penType !== undefined) this.toolState.set('penType', state.penType);
    });
  }

  getToolState(): ToolState {
    return {
      type: (this.toolState.get('type') as ToolState['type']) || 'cur',
      color: (this.toolState.get('color') as string) || '#000000',
      lineWidth: (this.toolState.get('lineWidth') as number) || 1,
      fontSize: (this.toolState.get('fontSize') as number) || 14,
      opacity: (this.toolState.get('opacity') as number) ?? 1,
      // penType 不在构造期写默认：避免覆盖快照恢复的持久笔型（F4.1 重进房恢复），读时兜底
      penType:
        (this.toolState.get('penType') as ToolState['penType']) === 'highlight'
          ? 'highlight'
          : 'pen'
    };
  }

  undo() {
    if (this.readOnly) return null;
    return this.undoManager.undo();
  }

  redo() {
    if (this.readOnly) return null;
    return this.undoManager.redo();
  }

  clearUndoStack(): void {
    this.undoManager.clear();
  }

  addShape(shapeData: any) {
    if (this.readOnly) return;
    const elements = this.getActiveElements();
    if (elements) {
      const map = new Y.Map();
      Object.entries(shapeData).forEach(([k, v]) => map.set(k, v));
      this.doc.transact(() => {
        elements.push([map]);
      });
    }
  }

  removeLastElement(): boolean {
    if (this.readOnly) return false;
    const elements = this.getActiveElements();
    if (!elements || elements.length === 0) return false;
    this.doc.transact(() => {
      elements.delete(elements.length - 1, 1);
    });
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
      keys.forEach(k => {
        if (map.has(k)) map.delete(k);
      });
    });
    return true;
  }

  removeElement(id: string): number {
    if (this.readOnly) return -1;
    const idx = this.findElementIndex(id);
    if (idx < 0) return -1;
    this.doc.transact(() => {
      this.getActiveElements()!.delete(idx, 1);
    });
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
    this.doc.transact(() => {
      this.fileList.push([map]);
    });
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
      fileurl: m.get('fileurl') || ''
    }));
  }

  // 光标：瞬时广播（awareness，不进 Yjs 文档/undo 栈），仅教师可写（学生端只渲染）
  updateCursor(cursor: CursorData) {
    if (this.readOnly) return;
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

  // F7.3 聚光灯/放大镜：瞬时广播（awareness，不进 Yjs 文档/undo 栈），仅教师可写（学生端只渲染）
  setSpotlight(state: SpotlightState | null) {
    if (this.readOnly) return;
    this.awareness.setLocalStateField('spotlight', state);
  }

  setMagnifier(state: MagnifierState | null) {
    if (this.readOnly) return;
    this.awareness.setLocalStateField('magnifier', state);
  }

  // F5.3 媒体进度：瞬时广播（awareness），仅教师可写；离散播放态（playing/time）走元素 attrs
  setMediaProgress(state: MediaProgressState | null) {
    if (this.readOnly) return;
    this.awareness.setLocalStateField('media', state);
  }

  destroy() {
    this.awareness.setLocalStateField('laser', null);
    this.awareness.setLocalStateField('cursor', null);
    this.awareness.setLocalStateField('spotlight', null);
    this.awareness.setLocalStateField('magnifier', null);
    this.awareness.setLocalStateField('media', null);
    this.awareness.setLocalStateField('user', null);
    this.provider.disconnect();
    this.undoManager.destroy();
    this.doc.destroy();
  }
}
