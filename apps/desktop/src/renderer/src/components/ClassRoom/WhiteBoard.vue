<template>
  <div class="classroom-white-board">
    <div class="whiteBoard">
      <div
        :id="containerId"
        :class="['container', 'cursor-' + mode]"
        :style="showFileList ? 'pointer-events: none' : ''"
      />

      <!-- 左侧工具面板 -->
      <div
        v-if="isTeacher && isDisplay"
        class="tools"
      >
        <el-tooltip
          content="选择器"
          placement="right"
        >
          <div
            :class="['cur', { on: mode === 'cur' }]"
            @click="tool('cur')"
          >
            <el-icon><Pointer /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="画笔工具"
          placement="right"
        >
          <div
            :class="['brush', { on: mode === 'brush' }]"
            @click="tool('brush')"
          >
            <el-icon><EditPen /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="文本工具"
          placement="right"
        >
          <div
            :class="['text', { on: mode === 'text' }]"
            @click="tool('text')"
          >
            <el-icon><Edit /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="圆形工具"
          placement="right"
        >
          <div
            :class="['circle', { on: mode === 'circle' }]"
            @click="tool('circle')"
          />
        </el-tooltip>
        <el-tooltip
          content="矩形工具"
          placement="right"
        >
          <div
            :class="['rectangle', { on: mode === 'rectangle' }]"
            @click="tool('rectangle')"
          />
        </el-tooltip>
        <el-tooltip
          content="箭头工具"
          placement="right"
        >
          <div
            :class="['arrows', { on: mode === 'arrows' }]"
            @click="tool('arrows')"
          >
            <el-icon><Promotion /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="橡皮擦"
          placement="right"
        >
          <div
            :class="['eraser', { on: mode === 'eraser' }]"
            @click="tool('eraser')"
          />
        </el-tooltip>
        <el-tooltip
          content="拖动工具"
          placement="right"
        >
          <div
            :class="['move', { on: mode === 'move' }]"
            @click="tool('move')"
          />
        </el-tooltip>
        <el-tooltip
          content="上传图片 · 贴到当前页"
          placement="right"
        >
          <div class="picture">
            <el-icon><Picture /></el-icon>
            <input
              type="file"
              accept="image/x-png,image/gif,image/jpeg,image/jpg,image/bmp"
              @change="takeFile"
            >
          </div>
        </el-tooltip>
        <el-tooltip
          content="我的课件"
          placement="right"
        >
          <div
            :class="['file', { on: mode === 'file' }]"
            @click="toggleFileList"
          >
            <el-icon><FolderOpened /></el-icon>
          </div>
        </el-tooltip>
      </div>

      <!-- 底部控制栏（仅教师：撤销/清空/缩放均写入或影响共享白板） -->
      <div
        v-if="isTeacher"
        class="ctrl-tools"
      >
        <el-tooltip
          content="撤回上一步"
          placement="top"
        >
          <div
            class="pre"
            @click="revocation('pre')"
          >
            <el-icon><RefreshLeft /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="返回下一步"
          placement="top"
        >
          <div
            class="next"
            @click="revocation('next')"
          >
            <el-icon><RefreshRight /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="清空当前画布"
          placement="top"
        >
          <div
            class="clear"
            @click="layerClear"
          />
        </el-tooltip>
        <el-tooltip
          content="缩小画布"
          placement="top"
        >
          <div
            class="sub"
            @click="layerZoomChange('sub')"
          >
            <el-icon><ZoomOut /></el-icon>
          </div>
        </el-tooltip>
        <div
          class="num"
          @click="editZoom"
        >
          {{ zoomLevel }}%
          <input
            v-show="showZoomInput"
            ref="zoomInputRef"
            v-model="zoomInputValue"
            type="number"
            class="zoom-input"
            :min="1"
            :max="200"
            @blur="importZoom"
            @keyup.enter="importZoom"
          >
        </div>
        <el-tooltip
          content="放大画布"
          placement="top"
        >
          <div
            class="add"
            @click="layerZoomChange('add')"
          >
            <el-icon><ZoomIn /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="画布全览"
          placement="top"
        >
          <div
            class="all"
            @click="layerZoomChange('all')"
          >
            <el-icon><FullScreen /></el-icon>
          </div>
        </el-tooltip>
      </div>

      <!-- 底部页面栏（仅教师：增删页/翻页写入共享文档并强制其他端跟随） -->
      <div
        v-if="isTeacher"
        class="page-tools"
      >
        <el-tooltip
          content="删除画布"
          placement="top"
        >
          <div
            class="del"
            @click="delLayer(curLayerIndex)"
          >
            <el-icon><Delete /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="首个画布"
          placement="top"
        >
          <div
            class="first"
            @click="showLayer(1)"
          >
            <el-icon><DArrowLeft /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="上一画布"
          placement="top"
        >
          <div
            class="pre"
            @click="showLayer(curLayerIndex - 1)"
          >
            <el-icon><ArrowLeft /></el-icon>
          </div>
        </el-tooltip>
        <div class="num">
          {{ curLayerIndex }}/{{ layerIndex }}
        </div>
        <el-tooltip
          content="下一画布"
          placement="top"
        >
          <div
            class="next"
            @click="showLayer(curLayerIndex + 1)"
          >
            <el-icon><ArrowRight /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="末尾画布"
          placement="top"
        >
          <div
            class="last"
            @click="showLayer(layerIndex)"
          >
            <el-icon><DArrowRight /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="新增画布"
          placement="top"
        >
          <div
            class="add"
            @click="addLayer"
          >
            <el-icon><Plus /></el-icon>
          </div>
        </el-tooltip>
      </div>

      <!-- 可拖拽颜色面板 -->
      <div
        v-show="showEditer && !colorPanelCollapsed"
        class="color-panel"
        :style="{ transform: `translate(${colorPanelX}px, ${colorPanelY}px)`, opacity: panelOpacity }"
        @mouseenter="cancelCloseColorPanel"
        @mouseleave="startCloseColorPanel"
      >
        <div
          class="color-panel-drag"
          @mousedown="onColorPanelDragStart"
        />
        <div class="edit-size">
          <div class="size-title">
            <div>{{ mode === 'text' ? '小' : '细' }}</div>
            <div>{{ mode === 'text' ? '大' : '粗' }}</div>
          </div>
          <div
            class="strip"
            @mousedown="editSizeStart"
            @mousemove="editSizeMove"
            @mouseup="editSizeEnd"
            @mouseleave="editLeave"
          >
            <div
              class="strip-btn"
              :style="{ left: sizeBtnLeft + 'px' }"
            />
          </div>
        </div>
        <div class="edit-color">
          <div
            v-for="(c, i) in presetColors"
            :key="i"
            :class="['item', { on: currentColor === c }]"
            :style="{ background: c }"
            @click="selectColor(c)"
          />
          <div
            class="item colours"
            @click="showPallet = !showPallet"
          />
        </div>
        <div
          v-show="showPallet"
          class="pallet-box"
        >
          <div
            class="pal-color"
            @click="clickColor"
          >
            <div
              class="pal-btn"
              :style="{ left: palBtnLeft + 'px', top: palBtnTop + 'px' }"
            />
          </div>
          <div class="strip-color">
            <div
              v-for="(c, i) in lcolor"
              :key="i"
              class="color-item"
              :style="{ background: c }"
            />
            <div
              class="strip-color-btn"
              :style="{ left: stripMovePointX + 'px' }"
            />
          </div>
          <div class="endSelectColor">
            <div
              v-for="(c, i) in endSelectColor"
              :key="i"
              class="end-color-item"
              :style="{ background: c }"
              @click="selectColor(c)"
            />
          </div>
        </div>
        <div class="opacity-bar">
          <span class="opacity-label">画笔</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="currentOpacity"
            class="opacity-slider"
            @input="onOpacityInput"
          >
          <span class="opacity-val">{{ Math.round(currentOpacity * 100) }}%</span>
        </div>
        <div class="opacity-bar">
          <span class="opacity-label">面板</span>
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.01"
            :value="panelOpacity"
            class="opacity-slider"
            @input="onPanelOpacityInput"
          >
          <span class="opacity-val">{{ Math.round(panelOpacity * 100) }}%</span>
        </div>
      </div>

      <!-- 颜色面板收起按钮 -->
      <div
        v-show="showEditer && colorPanelCollapsed"
        class="color-panel-toggle"
        :style="{ transform: `translate(${colorPanelX}px, ${colorPanelY}px)` }"
        @mouseenter="openColorPanel"
        @mouseleave="startCloseColorPanel"
      >
        <div
          class="color-dot"
          :style="{ background: currentColor }"
        />
      </div>

      <!-- 课件列表 -->
      <div
        v-show="showFileList"
        class="fileList"
      >
        <div class="file-upload">
          <el-icon><Upload /></el-icon>
          <span>上传PPT课件</span>
          <input
            type="file"
            accept=".ppt,.pptx"
            @change="takeFile"
          >
        </div>
        <div
          v-for="(item, i) in fileList"
          :key="i"
          class="file-item"
        >
          <div
            class="file-name"
            @click="openCourseware(item)"
          >
            <span v-if="editFileIndex !== i">{{ item.filename }}.{{ item.filext }}</span>
            <input
              v-else
              :value="item.filename"
              class="file-name-input"
              @keyup.enter="alterFName(i, $event)"
              @blur="alterFName(i, $event)"
            >
          </div>
          <div class="file-size">
            {{ formatFileSize(item.filesize) }}
          </div>
          <el-icon
            class="file-del"
            aria-label="删除"
            @click.stop="delFile(i)"
          >
            <Delete />
          </el-icon>
        </div>
        <div class="file-hint">
          图片贴到当前页；点击课件列表创建并打开课件页，重进直播间自动恢复
        </div>
      </div>

      <!-- Loading -->
      <div
        v-show="loading"
        class="loading-div"
        @click.stop
      >
        <el-icon
          class="loading-gif is-loading"
          :size="48"
        >
          <Loading />
        </el-icon>
      </div>

      <!-- Toast -->
      <div
        v-show="toastMsg"
        class="alert"
      >
        {{ toastMsg }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { YjsProvider } from './whiteboard/YjsProvider';
import { KonvaRenderer } from './whiteboard/KonvaRenderer';
import { uploadPptFile, loadPptMeta, importPptPages, type PptMeta } from './whiteboard/pptImport';
import { PRESET_COLORS, type FileItem } from './whiteboard/types';
import { useUserStore } from '@/store/user';
import Live from '@/api/backstage';

const props = defineProps<{
  roomId: string;
  isTeacher: boolean;
  isDisplay?: boolean;
  opaqueId?: string;
  teacherStage?: any;
  userName?: string;
  layouts?: number;
}>();

const emit = defineEmits<{ (e: 'paint-log', data: any): void }>();

const KonvaLib = (window as any).Konva;

function serializeStage(): Record<string, unknown> | null {
  const stage = renderer?.getStage();
  if (!stage) return null;
  const obj: Record<string, unknown> = {
    attrs: {
      width: stage.width(),
      height: stage.height(),
      x: stage.x(),
      y: stage.y(),
      scaleX: stage.scaleX(),
      scaleY: stage.scaleY(),
    },
    className: 'Stage',
    children: [] as unknown[],
  };
  for (const child of stage.getChildren()) {
    if (child.className === 'Layer' || (KonvaLib && child instanceof KonvaLib.Layer)) {
      const layerObj: Record<string, unknown> = {
        attrs: {
          width: child.width(),
          height: child.height(),
          x: child.x(),
          y: child.y(),
          visible: child.visible(),
          scaleX: child.scaleX(),
          scaleY: child.scaleY(),
          offsetX: child.offsetX(),
          offsetY: child.offsetY(),
        },
        className: 'Layer',
        id: (child as any)._id,
        children: [] as unknown[],
      };
      for (const node of child.getChildren()) {
        const visible = node.visible !== undefined ? node.visible() : true;
        if (!visible) continue;
        const className = node.getClassName?.() || node.className;
        if (['Line', 'Rect', 'Circle', 'Text', 'Arrow', 'Image'].includes(className)) {
          const nodeObj: Record<string, unknown> = {
            attrs: node.getAttrs(),
            className,
            zIndex: node.zIndex(),
            id: (node as any)._id,
          };
          if (className === 'Image') {
            try {
              const imgAttr = node.getAttrs('image');
              if (imgAttr?.image?.src) nodeObj.imagesrc = imgAttr.image.src;
            } catch { /* skip */ }
          }
          layerObj.children.push(nodeObj);
        }
      }
      obj.children.push(layerObj);
    }
  }
  return obj;
}

function emitPaintLog() {
  const stageData = serializeStage();
  if (stageData) {
    emit('paint-log', { stage: JSON.stringify(stageData) });
  }
}

const route = useRoute();
const containerId = ref(`wb-container-${Date.now()}`);
const mode = ref<string>('cur');
const currentColor = ref('#000000');
const currentSize = ref(1);
const textSize = ref(14);
const zoomLevel = ref(100);
const showEditer = ref(false);
const showPallet = ref(false);
const showFileList = ref(false);
const showZoomInput = ref(false);
const zoomInputValue = ref(100);
const loading = ref(false);
const toastMsg = ref('');
const curLayerIndex = ref(1);
const layerIndex = ref(1);
const fileList = ref<any[]>([]);
const editFileIndex = ref(-1);
const presetColors = PRESET_COLORS;
const endSelectColor = ref(['#000', '#818181', '#B3B3B3', '#fff']);
const lcolor = ref<string[]>([]);
const palBtnLeft = ref(140);
const palBtnTop = ref(140);
const stripMovePointX = ref(266);
const sizeBtnLeft = ref(0);
const zoomInputRef = ref<HTMLInputElement>();
const currentOpacity = ref(1);
const panelOpacity = ref(1);

// Color panel drag state
const colorPanelCollapsed = ref(true);
const colorPanelX = ref(64);
const colorPanelY = ref(0);
const colorPanelDragOffsetX = ref(0);
const colorPanelDragOffsetY = ref(0);
const isDraggingColor = ref(false);
let colorPanelTimer: number | null = null;

const userId = (route.query.userId as string) || props.opaqueId || Date.now().toString(36);
const displayName = props.userName || (props.isTeacher ? 'Teacher' : 'Student');
const userColor = (() => {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h + userId.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 70%, 50%)`;
})();

let provider: YjsProvider | null = null;
let renderer: KonvaRenderer | null = null;
let currentElementsObserver: (() => void) | null = null;
let currentElementsObserved: any = null;

function onElementsChanged() {
  refreshLayer();
}

function bindElementsObserver(elements: any) {
  if (currentElementsObserved) {
    currentElementsObserved.unobserve(onElementsChanged);
    currentElementsObserved = null;
    currentElementsObserver = null;
  }
  elements.observe(onElementsChanged);
  currentElementsObserved = elements;
  currentElementsObserver = () => { elements.unobserve(onElementsChanged); };
}
let sizeDragging = false;
let toastTimer: any = null;

function toast(msg: string) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg.value = ''; }, 2000);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

function gradientColor(startColor: string, endColor: string, step: number): string[] {
  const s = hexToRgb(startColor);
  const e = hexToRgb(endColor);
  const result: string[] = [];
  for (let i = 0; i <= step; i++) {
    const r = Math.round(s[0] + (e[0] - s[0]) * i / step);
    const g = Math.round(s[1] + (e[1] - s[1]) * i / step);
    const b = Math.round(s[2] + (e[2] - s[2]) * i / step);
    result.push(`#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
  }
  return result;
}

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

onMounted(() => {
  provider = new YjsProvider(props.roomId, userId, displayName, userColor, (kind) => {
    useUserStore().sessionInterrupted(kind);
  }, !props.isTeacher);
  renderer = new KonvaRenderer(document.getElementById(containerId.value)!);
  renderer.onShapeClick = selectShape;
  renderer.onShapeDragEnd = commitShapeMove;
  renderer.onShapeTransformEnd = commitShapeTransform;
  renderer.setSelectMode(mode.value === 'cur' && props.isTeacher);
  renderer.showPage(0);

  lcolor.value = gradientColor('#000', '#fff', 23);

  const stage = renderer.getStage();
  stage.on('mousedown touchstart', onPointerDown);
  stage.on('mousemove touchmove', onPointerMove);
  stage.on('mouseup touchend', onPointerUp);
  stage.on('wheel', onWheel);

  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onSelectionKeydown);

  // 计算颜色面板初始位置（选择工具右侧）
  nextTick(() => {
    const toolsEl = document.querySelector('.tools') as HTMLElement;
    if (toolsEl) {
      const rect = toolsEl.getBoundingClientRect();
      colorPanelX.value = rect.right + 10;
      colorPanelY.value = rect.top + 18;
    }
  });

  provider.toolState.observe(() => {
    const state = provider!.getToolState();
    currentColor.value = state.color;
    currentSize.value = state.lineWidth;
    textSize.value = state.fontSize;
    currentOpacity.value = state.opacity ?? 1;
  });

  // Sync viewport offset (move tool) — register once
  provider!.viewportOffset.observe(() => {
    const o = provider!.getViewportOffset();
    if (renderer) {
      renderer.layer.x(o.x);
      renderer.layer.y(o.y);
      renderer.layer.batchDraw();
    }
  });

  // Sync page count when teacher adds/removes pages — register once
  provider!.pages.observe(() => {
    if (!renderer) return;
    const yPages = provider!.getPages();
    const yPageIds: string[] = yPages.map((p: any) => p.get('id'));
    const localIds = [...renderer.pageIds];

    // Remove pages not in Yjs
    for (const localId of localIds) {
      if (!yPageIds.includes(localId)) {
        renderer.removePageById(localId);
      }
    }
    // Add pages missing locally
    for (let i = 0; i < yPageIds.length; i++) {
      if (!renderer.pageIds.includes(yPageIds[i])) {
        renderer.addPage(i, yPageIds[i]);
      }
    }

    layerIndex.value = renderer.getPageCount();
    const teacherIdx = provider!.getCurrentPageIndex();
    if (teacherIdx < renderer.getPageCount()) {
      renderer.showPage(teacherIdx);
    }
    curLayerIndex.value = renderer.getCurrentPageIndex() + 1;
    refreshLayer();
    const els = provider!.getActiveElements();
    if (els) bindElementsObserver(els);
  });

  // Sync page switching — register once
  provider!.currentPageIndex.observe(() => {
    if (!renderer) return;
    const teacherIdx = provider!.getCurrentPageIndex();
    const localIdx = renderer.getCurrentPageIndex();
    if (teacherIdx !== localIdx && teacherIdx < renderer.getPageCount()) {
      renderer.showPage(teacherIdx);
      curLayerIndex.value = teacherIdx + 1;
      refreshLayer();
      const els = provider!.getActiveElements();
      if (els) bindElementsObserver(els);
    }
  });

  // Sync file list when teacher adds/renames/deletes files
  provider!.fileList.observe(() => {
    fileList.value = provider!.getFileList();
  });

  // Wait for Yjs sync to complete before binding elements and observer.
  // On reconnect, re-bind elements and re-render.
  let hasSyncedOnce = false;
  let coursewareImportTriggered = false;
  provider.onSynced(() => {
    const elements = provider?.getActiveElements();
    if (elements && renderer) {
      renderer.bindElements(elements);
      bindElementsObserver(elements);
    }
    if (hasSyncedOnce) {
      refreshLayer();
    }
    hasSyncedOnce = true;
    // 首次同步后导入服务端课件（仅教师触发一次；重连不重复导入）
    if (props.isTeacher && !coursewareImportTriggered) {
      coursewareImportTriggered = true;
      void importServerCoursewares();
    }
  });
});

onUnmounted(() => {
  currentElementsObserver?.();
  window.removeEventListener('resize', onResize);
  document.removeEventListener('keydown', onSelectionKeydown);
  renderer?.destroy();
  provider?.destroy();
});

function onResize() {
  const el = document.getElementById(containerId.value);
  if (el && renderer) renderer.resize(el.clientWidth, el.clientHeight);
}

function getPointerPos(_e: any): { x: number; y: number } | null {
  const stage = renderer?.getStage();
  if (!stage) return null;
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  return stage.getAbsoluteTransform().copy().invert().point(pointer);
}

function toLayerCoords(pos: { x: number; y: number }): { x: number; y: number } {
  const layer = renderer!.layer;
  return { x: pos.x - layer.x(), y: pos.y - layer.y() };
}

// --- Tool selection ---
function setMode(type: string) {
  mode.value = type;
  renderer?.setSelectMode(type === 'cur' && props.isTeacher);
}

function tool(type: string) {
  setMode(type);
  showEditer.value = ['brush', 'eraser', 'text', 'circle', 'rectangle', 'arrows'].includes(type);
  showFileList.value = type === 'file';
  provider?.setToolState({ type: type as any });
}

function toggleFileList() {
  showFileList.value = !showFileList.value;
  showEditer.value = false;
  setMode(showFileList.value ? 'file' : 'cur');
}

// --- 选择器：单选图形，拖动/缩放/删除写回 Yjs ---
function snapshotShape(id: string, keys: string[]): Record<string, any> | null {
  const els = provider?.getActiveElements();
  if (!els) return null;
  const m = els.toArray().find((x: any) => x.get('id') === id);
  if (!m) return null;
  const out: Record<string, any> = {};
  keys.forEach(k => { out[k] = m.get(k); });
  return out;
}

function selectShape(id: string) {
  if (!props.isTeacher || mode.value !== 'cur' || !renderer) return;
  renderer.selectNode(id);
}

function clearSelection() {
  renderer?.clearSelection();
}

function getSelectedShapeId(): string | null {
  return renderer?.getSelectedId() ?? null;
}

function commitShapeMove(id: string, x: number, y: number) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const before = snapshotShape(id, ['x', 'y']);
  if (!before) return;
  before.x = before.x ?? 0;
  before.y = before.y ?? 0;
  if (before.x === x && before.y === y) return;
  if (!provider.updateElement(id, { x, y })) return;
  refreshLayer();
  redoStack.value = [];
  undoStack.value.push({
    type: 'updateShape',
    pageId: provider.getCurrentPageId(),
    pageIndex: renderer.getCurrentPageIndex(),
    shapeId: id,
    before,
    after: { x, y },
  });
  emitPaintLog();
}

function commitShapeTransform(id: string, attrs: Record<string, any>) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const before = snapshotShape(id, Object.keys(attrs));
  if (!before) return;
  if (!provider.updateElement(id, attrs)) return;
  refreshLayer();
  redoStack.value = [];
  undoStack.value.push({
    type: 'updateShape',
    pageId: provider.getCurrentPageId(),
    pageIndex: renderer.getCurrentPageIndex(),
    shapeId: id,
    before,
    after: { ...attrs },
  });
  emitPaintLog();
}

function deleteSelected() {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const id = renderer.getSelectedId();
  if (!id) return;
  const els = provider.getActiveElements();
  const m = els?.toArray().find((x: any) => x.get('id') === id);
  if (!m) return;
  const shapeData: Record<string, any> = {};
  m.forEach((v: any, k: string) => { shapeData[k] = v; });
  const index = provider.removeElement(id);
  if (index < 0) return;
  renderer.clearSelection();
  refreshLayer();
  redoStack.value = [];
  undoStack.value.push({
    type: 'removeShape',
    pageId: provider.getCurrentPageId(),
    pageIndex: renderer.getCurrentPageIndex(),
    shapeData,
    index,
  });
  emitPaintLog();
}

function onSelectionKeydown(e: KeyboardEvent) {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return;
  if (!renderer?.getSelectedId()) return;
  e.preventDefault();
  deleteSelected();
}

// --- Drawing state ---
let isDrawing = false;
let startPos: { x: number; y: number } | null = null;
let currentPath: number[] = [];

function onPointerDown(e: any) {
  // 学生端白板只读：不响应任何绘制/交互
  if (!props.isTeacher) return;
  const pos = getPointerPos(e);
  if (!pos) return;
  const m = mode.value;

  if (['brush', 'eraser'].includes(m)) {
    isDrawing = true;
    currentPath = [pos.x, pos.y];
  } else if (['circle', 'rectangle', 'arrows'].includes(m)) {
    isDrawing = true;
    startPos = pos;
  } else if (m === 'text') {
    const clickX = (e.evt as MouseEvent).clientX;
    const clickY = (e.evt as MouseEvent).clientY;
    setTimeout(() => {
      const textarea = document.createElement('textarea');
      textarea.style.cssText = `position:fixed; left:${clickX}px; top:${clickY}px; font-size:${textSize.value}px; color:${currentColor.value}; border:1px dashed #88b8cc; background:rgba(255,255,255,0.9); outline:none; resize:none; padding:2px 4px; margin:0; overflow:hidden; z-index:999; min-width:60px; min-height:${textSize.value + 8}px; font-family:sans-serif; line-height:1.2;`;
      document.body.appendChild(textarea);
      textarea.focus();
      const commitText = () => {
        const val = textarea.value.trim();
        if (val) {
          const layerPos = toLayerCoords(pos);
          const shapeData: Record<string, any> = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'text', x: layerPos.x, y: layerPos.y, text: val, fontSize: textSize.value, color: currentColor.value,
            opacity: currentOpacity.value,
          };
          provider?.addShape(shapeData);
          refreshLayer();
          redoStack.value = [];
          undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
        }
        textarea.remove();
        emitPaintLog();
      };
      textarea.addEventListener('blur', commitText);
      textarea.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); textarea.blur(); }
        if (ke.key === 'Escape') { textarea.value = ''; textarea.blur(); }
      });
    }, 0);
  } else if (m === 'move') {
    isDrawing = true;
    startPos = pos;
  } else if (m === 'cur') {
    // 点击空白处取消选中（点中图形由节点 click 处理器选中）
    const target = e.target;
    if (!target || target === renderer?.getStage() || target === renderer?.layer || target === renderer?.tempLayer) {
      renderer?.clearSelection();
    }
  }
}

function onPointerMove(e: any) {
  if (!isDrawing) return;
  const pos = getPointerPos(e);
  if (!pos) return;
  const m = mode.value;

  if (['brush', 'eraser'].includes(m)) {
    currentPath.push(pos.x, pos.y);
    renderer!.tempLayer.destroyChildren();
    const KonvaLib = (window as any).Konva;
    if (KonvaLib) {
      const line = new KonvaLib.Line({
        points: currentPath,
        stroke: m === 'eraser' ? '#ffffff' : currentColor.value,
        strokeWidth: currentSize.value * (m === 'eraser' ? 3 : 1),
        lineCap: 'round', lineJoin: 'round', tension: 0.5,
      });
      renderer!.tempLayer.add(line);
      renderer!.tempLayer.batchDraw();
    }
  } else if (['circle', 'rectangle', 'arrows'].includes(m) && startPos) {
    renderer!.tempLayer.destroyChildren();
    drawTempShape(pos);
    renderer!.tempLayer.batchDraw();
  } else if (m === 'move' && startPos) {
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    const layer = renderer!.layer;
    const newX = layer.x() + dx;
    const newY = layer.y() + dy;
    layer.x(newX);
    layer.y(newY);
    layer.batchDraw();
    provider?.setViewportOffset(newX, newY);
    startPos = pos;
  }

  provider?.updateCursor({ userId, userName: displayName, x: pos.x, y: pos.y, color: userColor });
}

function onPointerUp(_e: any) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getPointerPos(_e);
  renderer!.tempLayer.destroyChildren();
  renderer!.tempLayer.batchDraw();
  const m = mode.value;

  if (m !== 'move') redoStack.value = [];

  if (['brush', 'eraser'].includes(m) && currentPath.length > 2) {
    const layerPath: number[] = [];
    for (let i = 0; i < currentPath.length; i += 2) {
      const lp = toLayerCoords({ x: currentPath[i]!, y: currentPath[i + 1]! });
      layerPath.push(lp.x, lp.y);
    }
    const shapeData: Record<string, any> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: m, points: layerPath, color: currentColor.value, lineWidth: currentSize.value,
      opacity: currentOpacity.value,
    };
    provider?.addShape(shapeData);
    currentPath = [];
    refreshLayer();
    undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
  } else if (m === 'circle' && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    const dx = layerEnd.x - layerStart.x;
    const dy = layerEnd.y - layerStart.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    if (radius > 2) {
      const shapeData: Record<string, any> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'circle', x: layerStart.x, y: layerStart.y, radius, color: currentColor.value, lineWidth: currentSize.value,
        opacity: currentOpacity.value,
      };
      provider?.addShape(shapeData);
      refreshLayer();
      undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
    }
  } else if (m === 'rectangle' && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    const w = Math.abs(layerEnd.x - layerStart.x);
    const h = Math.abs(layerEnd.y - layerStart.y);
    if (w > 2 && h > 2) {
      const shapeData: Record<string, any> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'rect', x: Math.min(layerStart.x, layerEnd.x), y: Math.min(layerStart.y, layerEnd.y),
        width: w, height: h, color: currentColor.value, lineWidth: currentSize.value,
        opacity: currentOpacity.value,
      };
      provider?.addShape(shapeData);
      refreshLayer();
      undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
    }
  } else if (m === 'arrows' && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    const dx = layerEnd.x - layerStart.x;
    const dy = layerEnd.y - layerStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      const shapeData: Record<string, any> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'arrow', points: [layerStart.x, layerStart.y, layerEnd.x, layerEnd.y], color: currentColor.value, lineWidth: currentSize.value,
        opacity: currentOpacity.value,
      };
      provider?.addShape(shapeData);
      refreshLayer();
      undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
    }
  }
  startPos = null;
  emitPaintLog();
}

function drawTempShape(pos: { x: number; y: number }) {
  if (!startPos || !renderer) return;
  const KonvaLib = (window as any).Konva;
  if (!KonvaLib) return;
  const m = mode.value;

  if (m === 'rectangle') {
    renderer.tempLayer.add(new KonvaLib.Rect({
      x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x), height: Math.abs(pos.y - startPos.y),
      stroke: currentColor.value, strokeWidth: currentSize.value,
    }));
  } else if (m === 'circle') {
    const r = Math.sqrt((pos.x - startPos.x) ** 2 + (pos.y - startPos.y) ** 2);
    renderer.tempLayer.add(new KonvaLib.Circle({
      x: startPos.x, y: startPos.y, radius: r,
      stroke: currentColor.value, strokeWidth: currentSize.value,
    }));
  } else if (m === 'arrows') {
    renderer.tempLayer.add(new KonvaLib.Arrow({
      points: [startPos.x, startPos.y, pos.x, pos.y],
      stroke: currentColor.value, strokeWidth: currentSize.value, fill: currentColor.value,
    }));
  }
}

function onWheel(e: WheelEvent) {
  // 学生端白板只读：视图固定 100%，禁止滚轮缩放
  if (!props.isTeacher) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -10 : 10;
  layerZoomChange(delta > 0 ? 'add' : 'sub');
}

function refreshLayer() {
  const elements = provider?.getActiveElements();
  if (elements && renderer) renderer.bindElements(elements);
}

// --- Undo/Redo ---
interface UndoAction {
  type: 'addShape' | 'addPage' | 'updateShape' | 'removeShape';
  pageId: string;
  pageIndex: number;
  shapeData?: Record<string, any>;
  shapeId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  index?: number;
}
const undoStack = ref<UndoAction[]>([]);
const redoStack = ref<UndoAction[]>([]);

function ensurePageIndex(targetIndex: number) {
  if (!renderer) return;
  if (renderer.getCurrentPageIndex() !== targetIndex) {
    renderer.showPage(targetIndex);
    curLayerIndex.value = targetIndex + 1;
    provider?.setCurrentPageIndex(targetIndex);
    refreshLayer();
    const els = provider?.getActiveElements();
    if (els) bindElementsObserver(els);
  }
}

function revocation(type: string) {
  if (!props.isTeacher) return;
  if (!renderer) return;
  if (type === 'pre') {
    const action = undoStack.value.pop();
    if (!action) { toast('没有更多撤销'); return; }
    if (action.type === 'addShape') {
      ensurePageIndex(action.pageIndex);
      provider?.removeLastElement();
      refreshLayer();
    } else if (action.type === 'addPage') {
      provider?.removePage(action.pageIndex);
      const newIdx = Math.min(action.pageIndex, renderer.getPageCount() - 1);
      ensurePageIndex(newIdx);
      layerIndex.value = renderer.getPageCount();
      refreshLayer();
    } else if (action.type === 'updateShape') {
      ensurePageIndex(action.pageIndex);
      provider?.updateElement(action.shapeId!, action.before!);
      refreshLayer();
    } else if (action.type === 'removeShape') {
      ensurePageIndex(action.pageIndex);
      provider?.insertElement(action.index!, action.shapeData!);
      refreshLayer();
    }
    redoStack.value.push(action);
  } else {
    const action = redoStack.value.pop();
    if (!action) { toast('没有更多重做'); return; }
    if (action.type === 'addShape') {
      ensurePageIndex(action.pageIndex);
      provider?.addShape(action.shapeData!);
      refreshLayer();
    } else if (action.type === 'addPage') {
      provider?.addPage();
    } else if (action.type === 'updateShape') {
      ensurePageIndex(action.pageIndex);
      provider?.updateElement(action.shapeId!, action.after!);
      refreshLayer();
    } else if (action.type === 'removeShape') {
      ensurePageIndex(action.pageIndex);
      const idx = provider?.removeElement(action.shapeData!.id) ?? -1;
      if (idx >= 0) action.index = idx;
      refreshLayer();
    }
    undoStack.value.push(action);
  }
  emitPaintLog();
}
function layerClear() {
  // 学生端守卫：直接操作 Yjs elements，绕过 provider，必须在此拦截
  if (!props.isTeacher) return;
  renderer?.clearCurrentPage();
  provider?.getActiveElements()?.delete(0, provider.getActiveElements().length);
  undoStack.value = [];
  redoStack.value = [];
  emitPaintLog();
}

// --- Zoom ---
function layerZoomChange(type: string) {
  if (!renderer) return;
  if (type === 'sub') zoomLevel.value = renderer.zoomOut();
  else if (type === 'add') zoomLevel.value = renderer.zoomIn();
  else if (type === 'all') { renderer.zoomFitAll(); zoomLevel.value = renderer.getZoom(); }
  emitPaintLog();
}

function editZoom() {
  showZoomInput.value = true;
  zoomInputValue.value = zoomLevel.value;
  nextTick(() => zoomInputRef.value?.focus());
}

function importZoom() {
  showZoomInput.value = false;
  const val = parseInt(String(zoomInputValue.value));
  if (isNaN(val)) return;
  zoomLevel.value = Math.max(1, Math.min(200, val));
  renderer?.setZoom(zoomLevel.value);
  emitPaintLog();
}

// --- Pages ---
function addLayer() {
  const pageId = provider?.addPage() || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  redoStack.value = [];
  undoStack.value.push({ type: 'addPage', pageId, pageIndex: provider!.getCurrentPageIndex() });
  emitPaintLog();
}

function showLayer(index: number) {
  if (!renderer) return;
  const max = renderer.getPageCount();
  index = Math.max(1, Math.min(max, index));
  renderer.showPage(index - 1);
  curLayerIndex.value = index;
  provider?.setCurrentPageIndex(index - 1);
  refreshLayer();
  redoStack.value = [];
  const newElements = provider?.getActiveElements();
  if (newElements) bindElementsObserver(newElements);
  zoomLevel.value = renderer.getZoom();
  emitPaintLog();
}

function delLayer(index: number) {
  if (!renderer) return;
  if (renderer.getPageCount() <= 1) { layerClear(); return; }
  provider?.removePage(index - 1);
  toast('已删除画布');
  emitPaintLog();
}

// --- Color ---
function selectColor(color: string) {
  currentColor.value = color;
  provider?.setToolState({ color });
  const idx = endSelectColor.value.indexOf(color);
  if (idx > -1) endSelectColor.value.splice(idx, 1);
  endSelectColor.value.unshift(color);
  if (endSelectColor.value.length > 4) endSelectColor.value.pop();
}

function clickColor(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = rect.width;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2;
  const dx = x - centerX;
  const dy = y - centerY;

  palBtnLeft.value = Math.max(0, Math.min(size - 12, x - 6));
  palBtnTop.value = Math.max(0, Math.min(size - 12, y - 6));

  if (Math.sqrt(dx * dx + dy * dy) > radius) return;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createConicGradient(-Math.PI / 2, centerX, centerY);
  const stops = [
    '#7cff00', '#2bff0c', '#01ff62', '#00ffc3', '#00fffb',
    '#00aeff', '#007cff', '#1f1cff', '#6800ff', '#ad00ff',
    '#e800c7', '#ff006d', '#ff0000', '#ff8700', '#edbb00', '#cffb00', '#7cff00'
  ];
  stops.forEach((c, i) => gradient.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  const hex = '#' + [pixel[0], pixel[1], pixel[2]]
    .map(v => v.toString(16).padStart(2, '0')).join('');
  selectColor(hex);
}

// --- Size slider ---
function editSizeStart(e: MouseEvent) {
  sizeDragging = true;
  updateSizeFromMouse(e);
}
function editSizeMove(e: MouseEvent) {
  if (sizeDragging) updateSizeFromMouse(e);
}
function editSizeEnd() { sizeDragging = false; }
function editLeave() { sizeDragging = false; }

// Color panel drag
function onColorPanelDragStart(e: MouseEvent) {
  isDraggingColor.value = true;
  colorPanelDragOffsetX.value = e.clientX - colorPanelX.value;
  colorPanelDragOffsetY.value = e.clientY - colorPanelY.value;
  document.addEventListener('mousemove', onColorPanelDragMove);
  document.addEventListener('mouseup', onColorPanelDragEnd);
}
function onColorPanelDragMove(e: MouseEvent) {
  colorPanelX.value = e.clientX - colorPanelDragOffsetX.value;
  colorPanelY.value = e.clientY - colorPanelDragOffsetY.value;
}
function onColorPanelDragEnd() {
  isDraggingColor.value = false;
  document.removeEventListener('mousemove', onColorPanelDragMove);
  document.removeEventListener('mouseup', onColorPanelDragEnd);
}
function openColorPanel() {
  if (colorPanelTimer) { clearTimeout(colorPanelTimer); colorPanelTimer = null; }
  colorPanelCollapsed.value = false;
}
function startCloseColorPanel() {
  if (isDraggingColor.value) return;
  colorPanelTimer = window.setTimeout(() => {
    colorPanelCollapsed.value = true;
    colorPanelTimer = null;
  }, 300);
}
function cancelCloseColorPanel() {
  if (colorPanelTimer) { clearTimeout(colorPanelTimer); colorPanelTimer = null; }
}
function onOpacityInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  currentOpacity.value = val;
  provider?.setToolState({ opacity: val });
}
function onPanelOpacityInput(e: Event) {
  panelOpacity.value = parseFloat((e.target as HTMLInputElement).value);
}
function updateSizeFromMouse(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = Math.max(0, Math.min(130, e.clientX - rect.left));
  sizeBtnLeft.value = x;
  const size = mode.value === 'text' ? Math.round(8 + (x / 130) * 40) : Math.round(1 + (x / 130) * 19);
  if (mode.value === 'text') {
    textSize.value = size;
    provider?.setToolState({ fontSize: size });
  } else {
    currentSize.value = size;
    provider?.setToolState({ lineWidth: size });
  }
}

// --- File upload ---
const uploadImageApi = import.meta.env.VITE_UPLOAD_IMAGE_URL || '';
const uploadPptApi = import.meta.env.VITE_UPLOAD_PPT_URL || '';

async function takeFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  if (/\.(jpg|jpeg|gif|png|bmp)$/i.test(file.name)) {
    await uploadImage(file);
  } else if (/\.pptx?$/i.test(file.name)) {
    if (await uploadPPT(file)) {
      // 上传成功保持课件列表打开，便于立即点击加载（与 toggleFileList 同款状态切换）
      showFileList.value = true;
      showEditer.value = false;
      setMode('file');
      return;
    }
  }
  mode.value = 'cur';
  tool('cur');
}

// 加载图片取自然尺寸（供限幅计算）；失败抛错由调用方 toast
function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

async function uploadImage(file: File) {
  if (!uploadImageApi) { toast('未配置图片上传接口'); return; }
  loading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(uploadImageApi, { method: 'POST', body: fd });
    if (!res.ok) {
      toast(`上传失败: ${res.status} ${res.statusText}`);
      loading.value = false;
      return;
    }
    const data = await res.json();
    if (data.code === 1000 && data.data?.fileUrl) {
      const fileUrl = data.data.fileUrl as string;
      // 先取自然尺寸再限幅：图片必须写入 Yjs（与其他图形一致），
      // 否则任何 refreshLayer 的 destroyChildren 全量重建都会把本地节点抹掉
      let img: HTMLImageElement;
      try {
        img = await loadImageEl(fileUrl);
      } catch (err) {
        toast(`图片加载失败: ${(err as Error).message}`);
        return;
      }
      const el = document.getElementById(containerId.value);
      const maxW = (el?.clientWidth || 800) * 0.6;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxW) {
        h = h * (maxW / w);
        w = maxW;
      }
      const shapeData: Record<string, any> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'image',
        url: fileUrl,
        x: 50,
        y: 50,
        width: w,
        height: h,
        opacity: currentOpacity.value,
      };
      // 同步尚未完成时 pages 可能未播种，getActiveElements() 为 null 会让 addShape 静默丢弃；先兜底建页
      if (!provider?.getActiveElements()) {
        provider?.addPage();
      }
      provider?.addShape(shapeData);
      refreshLayer();
      redoStack.value = [];
      undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
      emitPaintLog();
      toast('图片已添加');
    } else {
      toast('上传失败');
    }
  } catch (e) { toast(`上传出错: ${(e as Error).message}`); }
  loading.value = false;
}

// 预载全部页尺寸（阶段1）已抽至 whiteboard/pptImport.ts:loadPptMeta

async function uploadPPT(file: File): Promise<boolean> {
  if (!uploadPptApi) { toast('未配置PPT上传接口'); return false; }
  loading.value = true;
  try {
    let fileUrl: string;
    try {
      fileUrl = await uploadPptFile(uploadPptApi, file);
    } catch (err) {
      toast((err as Error).message);
      return false;
    }

    // 阶段1：解析 PDF 校验可读并取页数（供 toast 提示）；任一失败仅提示，零登记
    let meta: PptMeta;
    try {
      meta = await loadPptMeta(fileUrl);
    } catch (err) {
      toast(`课件预载失败: ${(err as Error).message}`);
      return false;
    }

    // 阶段2：零建页 —— 仅登记列表条目（fileid 留空），点击列表时才创建课件页
    // 并展示（见 openCourseware）；上传前后画布与当前页保持原样
    const ext = file.name.split('.').pop() || 'ppt';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    provider?.addFileItem({
      filename: baseName, filext: ext, filesize: file.size, fileid: '',
      fileurl: fileUrl,
    });
    fileList.value = provider!.getFileList();
    toast(`PPT已导入，共${meta.numPages}页，请点击列表打开`);
    // 登记服务端课件表：房空后重进直播间可自动恢复（失败不影响已导入的白板）
    void saveCoursewareRecord({ filename: baseName, filext: ext, filesize: file.size, fileUrl });
    return true;
  } catch (e) {
    toast(`PPT上传出错: ${(e as Error).message}`);
    return false;
  } finally {
    loading.value = false;
  }
}

// 登记到服务端课件表（房内上传与进房前上传共用同一张表）
async function saveCoursewareRecord(item: {
  filename: string;
  filext: string;
  filesize: number;
  fileUrl: string;
}) {
  try {
    await Live.save_courseware({ roomId: props.roomId, ...item });
  } catch (e) {
    console.error('课件登记失败', e);
  }
}

// 进房自动登记服务端课件（仅教师，首次 synced 后触发）：
// 按 fileurl 去重（含已登记未建页的条目）—— 仅入列表零建页，点击列表才创建课件页
async function importServerCoursewares() {
  if (!provider || !props.isTeacher) return;
  const res = await Live.courseware_list(props.roomId).catch((e: unknown) => {
    console.error('课件列表拉取失败', e);
    return null;
  });
  if (!res) return;
  const items: Array<{ id: string; filename: string; filext: string; filesize: number; fileUrl: string }> =
    res.data.data?.list ?? [];
  const existing = new Set(provider.getFileList().map(i => i.fileurl).filter(Boolean));
  const pending = items.filter(it => it.fileUrl && !existing.has(it.fileUrl));
  if (pending.length === 0) return;

  for (const item of pending) {
    provider.addFileItem({
      filename: item.filename,
      filext: item.filext || 'ppt',
      filesize: Number(item.filesize) || 0,
      fileid: '',
      fileurl: item.fileUrl,
    });
  }
  fileList.value = provider.getFileList();
}

// --- File list ---
function removePagesByIds(ids: string[]) {
  // 学生端守卫：直接操作 Yjs pages/elements，绕过 provider，必须在此拦截
  if (!props.isTeacher) return;
  if (!provider || ids.length === 0) return;
  const pages = provider.getPages();
  const targets: number[] = [];
  for (let i = pages.length - 1; i >= 0; i--) {
    const pid = String(pages.get(i).get('id'));
    if (ids.includes(pid)) targets.push(i);
  }
  if (targets.length === 0) return;
  const removeAll = targets.length === pages.length;
  targets.sort((a, b) => b - a);
  for (const idx of targets) {
    // removePage 自带保底（至少保留一页），Konva 层由 pages.observe 同步移除
    provider.removePage(idx);
  }
  if (removeAll) {
    // 全删场景：保底留下的页（最小索引）可能带课件图，清空其 elements 避免残留
    const els = provider.getElementsAtPage(0);
    if (els && els.length > 0) els.delete(0, els.length);
    refreshLayer();
  }
}

// 当前页 shape 的纯对象快照（Y.Map.toJSON），供测试/调用方断言
function getCurrentPageShapes(): Record<string, unknown>[] {
  const els = provider?.getActiveElements();
  if (!els) return [];
  return els
    .toArray()
    .map((el: any) => (el && typeof el.toJSON === 'function' ? el.toJSON() : el)) as Record<
    string,
    unknown
  >[];
}

// 点击课件列表：已有页（历史/已创建）直接导航；未建页则创建课件页并展示
async function openCourseware(item: FileItem) {
  if (!provider || !renderer) return;
  if (item.fileid) {
    showFile(item.fileid);
    return;
  }
  if (!props.isTeacher) {
    toast('仅教师可加载课件');
    return;
  }
  if (loading.value) return; // 防双击重复建页
  const fileUrl = item.fileurl;
  if (!fileUrl) {
    toast('课件地址缺失');
    return;
  }
  loading.value = true;
  try {
    const meta = await loadPptMeta(fileUrl);
    const box = document.getElementById(containerId.value);
    const cw = box?.clientWidth || 800;
    const ch = box?.clientHeight || 600;
    const startIdx = provider.getPages().length;
    let layerIds: string[] = [];
    // 单事务建页并落到首张幻灯片：观察者提交时触发一次，直接切到目标页不闪页
    provider.doc.transact(() => {
      layerIds = importPptPages(provider, cw, ch, fileUrl, meta);
      provider.setCurrentPageIndex(startIdx);
    });
    if (layerIds.length === 0) {
      toast('PPT页面创建失败');
      return;
    }
    // 回填 fileid（定位仍未建页的该条目），后续点击走 showFile 直接导航
    const rawIdx = provider.fileList
      .toArray()
      .findIndex((m: any) => m.get('fileurl') === fileUrl && !m.get('fileid'));
    if (rawIdx >= 0) provider.setFileItemId(rawIdx, layerIds.join(','));
    fileList.value = provider.getFileList();
    showLayer(startIdx + 1);
    showFileList.value = false;
    toast(`已打开「${item.filename}」，共${meta.numPages}页`);
  } catch (err) {
    toast(`课件打开失败: ${(err as Error).message}`);
  } finally {
    loading.value = false;
  }
}

function showFile(ids: string) {
  try {
    if (!ids) return;
    const arr = ids.split(',').filter(Boolean);
    if (arr.length === 0 || !provider || !renderer) return;
    const firstId = arr[0];
    const pages = provider.getPages();
    for (let i = 0; i < pages.length; i++) {
      const pid = String(pages.get(i).get('id'));
      if (pid === firstId) {
        showLayer(i + 1);
        showFileList.value = false;
        return;
      }
    }
    toast('未找到对应页面，已切换到第1页');
    showLayer(1);
    showFileList.value = false;
  } catch (e) {
    toast('打开文件失败');
  }
}

function alterFName(i: number, e: Event) {
  const val = (e.target as HTMLInputElement).value.trim();
  if (!val) { toast('名字不能为空!'); return; }
  provider?.renameFileItem(i, val);
  fileList.value = provider!.getFileList();
  editFileIndex.value = -1;
}

function delFile(i: number) {
  const item = fileList.value[i];
  if (!item) return;
  const hadPages = !!item.fileid;
  if (hadPages) removePagesByIds(item.fileid.split(',').filter(Boolean));
  // getFileList 不再过滤，fileList 索引与原始 Y.Array 一一对应
  provider?.removeFileItem(i);
  fileList.value = provider!.getFileList();
  if (hadPages) showLayer(1);
}

defineExpose({
  layerClear,
  tool,
  addLayer,
  showLayer,
  showFile,
  openCourseware,
  delFile,
  fileList,
  layerIndex,
  curLayerIndex,
  toastMsg,
  rendererPageCount: () => renderer?.getPageCount() ?? 0,
  renderedShapeCount: () => renderer?.getNodeCount() ?? 0,
  getCurrentPageShapes,
  importServerCoursewares,
  revocation,
  selectShape,
  clearSelection,
  getSelectedShapeId,
  commitShapeMove,
  commitShapeTransform,
  deleteSelected,
});
</script>

<style scoped lang="less">
@wbicon: '../../assets/imgs/whiteboard/wbicon-list.png';

@colorIcon: '../../assets/imgs/whiteboard/color-icon.png';

.classroom-white-board { width: 100%; height: 100%; position: relative; }
.whiteBoard { width: 100%; height: 100%; position: relative; overflow: visible; background: #fff; }
.container { width: 100%; height: 100%; position: relative; }

.cursor-text { cursor: text; }
.cursor-brush { cursor: url('../../assets/imgs/whiteboard/m_brush.png') 2 22, crosshair; }
.cursor-eraser { cursor: url('../../assets/imgs/whiteboard/m_eraser.png') 8 18, crosshair; }
.cursor-move { cursor: url('../../assets/imgs/whiteboard/m_move.png') 8 18, grab; }

.tools {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  width: 44px; background: #efeff4; border-radius: 12px; display: flex;
  flex-direction: column; align-items: center; padding: 4px 0; gap: 4px; z-index: 10;
  div { width: 32px; height: 32px; border-radius: 6px; cursor: pointer; flex-shrink: 0; position: relative;
    display: flex; align-items: center; justify-content: center;
    &:hover { background-color: #e2e2e7; }
    &.on { background-color: #fff; }
    .el-icon { font-size: 16px; color: #555; }
    &.on .el-icon { color: #409eff; }
  }
  .circle, .rectangle, .eraser, .move {
    background-image: url('@{wbicon}'); background-repeat: no-repeat;
  }
  .rectangle { background-position: 0 -34px; }
  .move { background-position: -34px -68px; }
  .eraser { background-position: 0 -102px; }
  .circle { background-position: -68px -34px; }
  input[type='file'] { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
}

.ctrl-tools {
  position: absolute; left: 64px; bottom: 10px; height: 36px; background: #efeff4;
  border-radius: 12px; display: flex; align-items: center; padding: 0 6px; gap: 2px; z-index: 10;
  div { width: 26px; height: 26px; border-radius: 4px; cursor: pointer; flex-shrink: 0; position: relative;
    display: flex; align-items: center; justify-content: center;
    .el-icon { font-size: 14px; color: #555; }
    &:hover { background-color: #e2e2e7; }
  }
  .clear {
    background-image: url('@{wbicon}'); background-repeat: no-repeat;
    background-position: -154px 0;
  }
  .num { width: auto; min-width: 48px; text-align: center; font-size: 12px; line-height: 26px;
    background: none; cursor: pointer; position: relative;
    .zoom-input { position: absolute; top: 0; left: 0; width: 100%; height: 100%; text-align: center;
      font-size: 12px; border: 1px solid #ccc; border-radius: 4px; display: none; }
    &:hover .zoom-input { display: block; }
  }
}

.page-tools {
  position: absolute; right: 10px; bottom: 10px; height: 36px; background: #efeff4;
  border-radius: 12px; display: flex; align-items: center; padding: 0 6px; gap: 2px; z-index: 10;
  div { width: 26px; height: 26px; border-radius: 4px; cursor: pointer; flex-shrink: 0; position: relative;
    display: flex; align-items: center; justify-content: center;
    .el-icon { font-size: 14px; color: #555; }
    &:hover { background-color: #e2e2e7; }
  }
  .num { width: auto; min-width: 36px; text-align: center; font-size: 12px; line-height: 26px; background: none; }
}

.color-panel {
  position: absolute; top: 0; left: 0; z-index: 10; will-change: transform, opacity;
  width: 180px; background: #f3f3f4; border-radius: 8px; padding: 12px;
  .color-panel-drag { width: 100%; height: 14px; cursor: move; border-radius: 4px 4px 0 0; margin: -12px -12px 8px -12px; background: #e2e2e7; }
  .edit-size { margin-bottom: 12px; }
  .size-title { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-bottom: 6px; }
  .strip { width: 130px; height: 10px; background: linear-gradient(to right, #ccc, #333); border-radius: 5px;
    position: relative; margin: 0 auto; cursor: pointer;
    .strip-btn { position: absolute; top: -3px; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; border: 2px solid #666; }
  }
  .edit-color { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;
    .item { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent;
      &.on { border-color: #409eff; }
      &.colours { background-image: url('@{colorIcon}'); background-size: cover; }
    }
  }
  .opacity-bar { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: #666;
    .opacity-label { white-space: nowrap; }
    .opacity-slider { flex: 1; height: 4px; -webkit-appearance: none; appearance: none; background: #ccc; border-radius: 2px; outline: none;
      &::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #409eff; cursor: pointer; border: 2px solid #fff; box-shadow: 0 0 2px #000; }
    }
    .opacity-val { min-width: 28px; text-align: right; }
  }
}

.color-panel-toggle {
  position: absolute; top: 0; left: 0; z-index: 10; will-change: transform;
  width: 32px; height: 32px; border-radius: 50%;
  background: #f3f3f4; cursor: pointer; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  .color-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 2px #000; }
}



.fileList {
  position: absolute; left: 60px; top: 50%; transform: translateY(-50%);
  width: 180px; max-height: 356px; background: #f3f3f4; border-radius: 8px; overflow-y: auto;
  padding: 8px; z-index: 10; pointer-events: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  .file-upload { position: relative; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 6px 4px; margin-bottom: 4px; border: 1px dashed #c0c4cc; border-radius: 6px;
    cursor: pointer; color: #409eff; font-size: 12px;
    &:hover { background-color: #e8e8ec; }
    input { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  }
  .file-item { display: flex; align-items: center; padding: 6px 4px; border-bottom: 1px solid #e0e0e0; gap: 4px; }
  .file-name { flex: 1; font-size: 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    .file-name-input { width: 100%; font-size: 12px; border: 1px solid #ccc; border-radius: 2px; padding: 1px 4px; }
  }
  .file-size { font-size: 10px; color: #999; }
  .file-del { width: 16px; height: 16px; cursor: pointer; color: #999;
    &:hover { color: #e0383e; }
    .el-icon { font-size: 16px; }
  }
  .file-hint { margin-top: 6px; font-size: 10px; line-height: 1.5; color: #999; }
}

.loading-div {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.3); display: flex; justify-content: center; align-items: center; z-index: 100;
  .loading-gif { width: 60px; height: 60px; color: #409eff; font-size: 48px; }
}

.alert {
  position: fixed; top: 40%; left: 50%; transform: translateX(-50%);
  padding: 12px 24px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 6px;
  font-size: 14px; z-index: 200; white-space: nowrap;
}
</style>
