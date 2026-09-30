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
          content="选择器 · 拖动移动，拉手柄缩放（Shift 等比，Delete 删除）"
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
          content="圆形工具 · 拖拽画椭圆，按住 Shift 画正圆"
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
          content="直线工具 · 按住 Shift 锁定水平/垂直"
          placement="right"
        >
          <div
            :class="['line', { on: mode === 'line' }]"
            @click="tool('line')"
          >
            <el-icon><Minus /></el-icon>
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
          content="激光笔 · 红点跟指，切换工具或 Esc 熄灭"
          placement="right"
        >
          <div
            :class="['laser', { on: mode === 'laser' }]"
            @click="toggleLaser"
          >
            <el-icon><Aim /></el-icon>
          </div>
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
            <div>{{ sizeTargetsText() ? '小' : '细' }}</div>
            <div>{{ sizeTargetsText() ? '大' : '粗' }}</div>
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
          v-if="showFillToggle"
          class="fill-bar"
        >
          <span class="fill-label">填充</span>
          <div
            :class="['fill-toggle', { on: fillEnabled }]"
            @click="toggleFill"
          >
            {{ fillEnabled ? '已填充' : '无填充' }}
          </div>
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
            @change="onOpacityChange"
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
            @click="openCourseware(item, i)"
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
import Konva from 'konva';
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
    if (child.className === 'Layer') {
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
        if (['Line', 'Rect', 'Circle', 'Ellipse', 'Text', 'Arrow', 'Image'].includes(className)) {
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
const showFillToggle = ref(false);
const fillEnabled = ref(false);
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
    currentElementsObserved.unobserveDeep(onElementsChanged);
    currentElementsObserved = null;
    currentElementsObserver = null;
  }
  // observeDeep：elements 是 Y.Array<Y.Map>，updateElement 改的是嵌套 Map 字段，
  // 直接 observe 只收结构增删（画笔/删除能同步、选择器拖动/缩放不同步），必须用深观察
  elements.observeDeep(onElementsChanged);
  currentElementsObserved = elements;
  currentElementsObserver = () => { elements.unobserveDeep(onElementsChanged); };
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
  renderer.onShapeDblClick = editTextShape;
  renderer.onShapeDragEnd = commitShapeMove;
  renderer.onShapeTransformEnd = commitShapeTransform;
  renderer.onRefreshRequest = refreshLayer;
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
  provider.awareness.on('change', onAwarenessLaser);

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

  // Sync viewport (move pan / zoom / fit-all pan) — register once.
  // 本地写入与远端更新走同一观察器，幂等应用；zoomLevel 同步仅供教师端显示（学生端 UI 隐藏）。
  // 平移（移动工具 + 全览）统一走 x/y 通道，stage 保持恒等——否则选择器缩放坐标系错位
  provider!.viewportOffset.observe(() => {
    if (!renderer) return;
    const o = provider!.getViewportOffset();
    renderer.setViewport(o.x, o.y);
    const zoom = provider!.getViewportZoom();
    renderer.setZoom(zoom);
    zoomLevel.value = zoom;
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

  // Sync file list when teacher adds/renames/deletes files.
  // observeDeep：renameFileItem/setFileItemId 是嵌套 Map 字段更新，直接 observe 收不到
  provider!.fileList.observeDeep(() => {
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
  provider?.awareness.off('change', onAwarenessLaser);
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
  // 除以层缩放：pos 是舞台坐标，节点属性是层局部坐标（含 zoom 时否则落点偏移一个缩放因子）
  const s = layer.scaleX() || 1;
  return { x: (pos.x - layer.x()) / s, y: (pos.y - layer.y()) / s };
}

// --- Tool selection ---
function setMode(type: string) {
  // 激光模式被任何模式切换顶掉时即熄灭（工具栏/课件/激光按钮自关共用此收口）
  if (mode.value === 'laser' && type !== 'laser') laserOff();
  mode.value = type;
  renderer?.setSelectMode(type === 'cur' && props.isTeacher);
}

// 激光笔：仅教师。点选进入（红点跟指），切走/Esc 熄灭（awareness 瞬时广播，学生端只见红点）
function toggleLaser() {
  if (!props.isTeacher) return;
  if (mode.value === 'laser') {
    tool('cur');
    return;
  }
  setMode('laser');
  showEditer.value = false;
  showFillToggle.value = false;
  showFileList.value = false;
}

function laserOff() {
  provider?.setLaserOff();
  renderer?.setLaserPoint(null);
  lastLaserKey = '';
}

// awareness 激光状态 → 单点渲染（远端教师红点/本地回显/熄灭）。坐标即层局部坐标；
// 用坐标键去重：光标等高频 change 不重复触发渲染
function onAwarenessLaser() {
  if (!renderer || !provider) return;
  let laser: { x: number; y: number } | null = null;
  provider.awareness.getStates().forEach((s: any) => {
    if (s && s.laser) laser = s.laser;
  });
  const key = laser ? `${laser.x},${laser.y}` : '';
  if (key === lastLaserKey) return;
  lastLaserKey = key;
  renderer.setLaserPoint(laser ? laser.x : null, laser ? laser.y : 0);
}

function tool(type: string) {
  setMode(type);
  showEditer.value = ['brush', 'eraser', 'text', 'circle', 'rectangle', 'arrows', 'line'].includes(type);
  showFillToggle.value = false;
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
  // 只记录元素上实际存在的键：before/after 键集差即「形态字段差」（圆↔椭圆），
  // 供 undo/redo 用 deleteElementKeys 清理；缺失键写 undefined 会污染 Yjs 并破坏键集差判定
  keys.forEach(k => {
    const v = m.get(k);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

function selectShape(id: string) {
  if (!props.isTeacher || mode.value !== 'cur' || !renderer) return;
  renderer.selectNode(id);
  // 选中即打开属性面板并回填该图形当前值（仅本地显示，不广播 toolState）
  const m = provider?.getActiveElements()?.toArray().find(x => x.get('id') === id);
  if (!m) return;
  const type = String(m.get('type'));
  if (type === 'image' || type === 'ppt-image') {
    showEditer.value = false;
    showFillToggle.value = false;
    return;
  }
  colorPanelCollapsed.value = false;
  if (m.get('color') !== undefined) currentColor.value = String(m.get('color'));
  if (m.get('opacity') !== undefined) currentOpacity.value = Number(m.get('opacity'));
  const isText = type === 'text';
  if (isText && m.get('fontSize') !== undefined) textSize.value = Number(m.get('fontSize'));
  if (!isText && m.get('lineWidth') !== undefined) currentSize.value = Number(m.get('lineWidth'));
  if (isText && m.get('fontSize') !== undefined) {
    sizeBtnLeft.value = Math.max(0, Math.min(130, ((textSize.value - 8) / 40) * 130));
  } else if (m.get('lineWidth') !== undefined) {
    sizeBtnLeft.value = Math.max(0, Math.min(130, ((currentSize.value - 1) / 19) * 130));
  }
  showFillToggle.value = type === 'rect' || type === 'circle';
  fillEnabled.value = showFillToggle.value && m.get('fill') !== undefined;
  showEditer.value = true;
}

function clearSelection() {
  renderer?.clearSelection();
  if (mode.value === 'cur') {
    showEditer.value = false;
    showFillToggle.value = false;
  }
}

// 双击已有文本：原位弹出编辑框；Enter/失焦提交，Esc 弃改；
// 空内容与未改动视为放弃（避免留下不可见的空文本）
let editingTextId: string | null = null;

function editTextShape(id: string) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  if (editingTextId) return;
  const m = provider.getActiveElements()?.toArray().find(x => x.get('id') === id);
  if (!m || m.get('type') !== 'text') return;

  const layer = renderer.layer;
  const s = layer.scaleX() || 1;
  const screenX = layer.x() + (Number(m.get('x')) || 0) * s;
  const screenY = layer.y() + (Number(m.get('y')) || 0) * s;
  const original = String(m.get('text') ?? '');
  const fontSize = Number(m.get('fontSize')) || 14;
  const color = String(m.get('color') || '#000');

  const ta = document.createElement('textarea');
  ta.value = original;
  ta.style.cssText = `position:fixed; left:${screenX}px; top:${screenY}px; font-size:${fontSize}px; color:${color}; border:1px dashed #88b8cc; background:rgba(255,255,255,0.9); outline:none; resize:none; padding:2px 4px; margin:0; overflow:hidden; z-index:999; min-width:60px; min-height:${fontSize + 8}px; font-family:sans-serif; line-height:1.2;`;
  editingTextId = id;
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  let discarded = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    editingTextId = null;
    const val = ta.value.trim();
    ta.remove();
    if (discarded || !val || val === original) return;
    const before = snapshotShape(id, ['text']);
    if (!before) return;
    if (!applyShapeUpdate(id, { text: val }, before)) return;
    refreshLayer();
    redoStack.value = [];
    undoStack.value.push({
      type: 'updateShape', pageId: provider!.getCurrentPageId(),
      pageIndex: renderer!.getCurrentPageIndex(), shapeId: id,
      before, after: { text: val },
    });
    emitPaintLog();
  };
  ta.addEventListener('blur', finish);
  ta.addEventListener('keydown', ke => {
    if (ke.key === 'Enter' && !ke.shiftKey) {
      ke.preventDefault();
      finish();
    } else if (ke.key === 'Escape') {
      ke.preventDefault();
      discarded = true;
      finish();
    }
  });
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
  if (!provider.updateElement(id, { x, y })) {
    // 提交失败（元素已被远端删除等）：立即回滚视觉到 Yjs 实况，且不入 undo 栈
    refreshLayer();
    return;
  }
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

// 写入目标键并清理「对侧」独有的旧形态字段（圆↔椭圆的 radius/radiusX 互斥），
// 提交/撤销/重做三处共用，保持 Yjs 字段规范（createNode 按 radiusX 优先判定椭圆）
function applyShapeUpdate(id: string, target: Record<string, any>, other: Record<string, any>): boolean {
  if (!provider || !provider.updateElement(id, target)) return false;
  const stale = Object.keys(other).filter(k => !(k in target));
  if (stale.length) provider.deleteElementKeys(id, stale);
  return true;
}

// 选中图形的属性回改：写回 + 键集差清理 + 入 undo 栈（与提交/撤销/重做同一机制）。
// snapshotKeys 供「仅删除字段」类提交（如去填充）取快照——patch 为空时快照键需显式给出
function commitSelectedStyle(patch: Record<string, any>, snapshotKeys?: string[]) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const id = renderer.getSelectedId();
  if (!id) return;
  const keys = snapshotKeys ?? Object.keys(patch);
  const before = snapshotShape(id, keys);
  if (!before) return;
  // 无变化不入栈（含「去填充但本就无填充」）
  if (!keys.length && !Object.keys(before).length) return;
  if (keys.length && keys.every(k => before[k] === patch[k])) return;
  if (!applyShapeUpdate(id, patch, before)) return;
  refreshLayer();
  redoStack.value = [];
  undoStack.value.push({
    type: 'updateShape', pageId: provider.getCurrentPageId(),
    pageIndex: renderer.getCurrentPageIndex(), shapeId: id,
    before, after: { ...patch },
  });
  emitPaintLog();
}

// 粗细条当前作用对象：绘制文本模式，或选中的是文本图形 → 字号；否则线宽
function sizeTargetsText(): boolean {
  if (mode.value === 'text') return true;
  if (mode.value !== 'cur') return false;
  const id = renderer?.getSelectedId();
  if (!id) return false;
  return provider?.getActiveElements()?.toArray().find(x => x.get('id') === id)?.get('type') === 'text';
}

function commitShapeTransform(id: string, attrs: Record<string, any>) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const keys = Object.keys(attrs);
  // 圆→椭圆转换：快照里带上 radius，撤销才能还原正圆字段
  if (('radiusX' in attrs || 'radiusY' in attrs) && !keys.includes('radius')) keys.push('radius');
  const before = snapshotShape(id, keys);
  if (!before) return;
  if (!applyShapeUpdate(id, attrs, before)) {
    // 提交失败：立即回滚视觉（transformer 已烘焙 scale，必须重绑 Yjs 实况），不入 undo 栈
    refreshLayer();
    return;
  }
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
  clearSelection();
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

// --- Drawing state ---
let isDrawing = false;
let startPos: { x: number; y: number } | null = null;
let currentPath: number[] = [];
// 激光广播节流（50ms）与远端状态去重（同坐标不重复渲染）
let lastLaserSend = 0;
let lastLaserKey = '';

function onSelectionKeydown(e: KeyboardEvent) {
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    revocation('pre');
    return;
  }
  if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault();
    revocation('next');
    return;
  }
  if (e.key === 'Escape') {
    // Esc：取消选中并中止进行中的绘制/拖拽（学生端由 revocation/clearSelection 自身守卫）；
    // 激光模式 → 回选择器并熄灭
    clearSelection();
    if (mode.value === 'laser') setMode('cur');
    isDrawing = false;
    startPos = null;
    currentPath = [];
    return;
  }
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (!renderer?.getSelectedId()) return;
  e.preventDefault();
  deleteSelected();
}

function onPointerDown(e: any) {
  // 学生端白板只读：不响应任何绘制/交互
  if (!props.isTeacher) return;
  const pos = getPointerPos(e);
  if (!pos) return;
  const m = mode.value;

  if (['brush', 'eraser'].includes(m)) {
    isDrawing = true;
    currentPath = [pos.x, pos.y];
  } else if (['circle', 'rectangle', 'arrows', 'line'].includes(m)) {
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
    if (!target || target === renderer?.getStage() || target === renderer?.layer || target === renderer?.previewLayer || target === renderer?.tempLayer) {
      clearSelection();
    }
  }
}

function onPointerMove(e: any) {
  // 激光笔：不依赖 isDrawing，红点跟指 + 节流广播（学生端仅接收渲染，进不到此分支）
  if (mode.value === 'laser') {
    const pos = getPointerPos(e);
    if (pos) {
      const lp = toLayerCoords(pos);
      renderer?.setLaserPoint(lp.x, lp.y);
      const now = Date.now();
      if (now - lastLaserSend >= 50) {
        lastLaserSend = now;
        provider?.setLaser(lp.x, lp.y);
      }
    }
    return;
  }
  if (!isDrawing) return;
  const pos = getPointerPos(e);
  if (!pos) return;
  const m = mode.value;

  if (['brush', 'eraser'].includes(m)) {
    currentPath.push(pos.x, pos.y);
    renderer!.previewLayer.destroyChildren();
    // previewLayer 与 layer 同变换 → 预览节点必须存层局部坐标
    const layerPath: number[] = [];
    for (let i = 0; i < currentPath.length; i += 2) {
      const lp = toLayerCoords({ x: currentPath[i]!, y: currentPath[i + 1]! });
      layerPath.push(lp.x, lp.y);
    }
    const line = new Konva.Line({
      points: layerPath,
      stroke: m === 'eraser' ? '#ffffff' : currentColor.value,
      strokeWidth: currentSize.value * (m === 'eraser' ? 3 : 1),
      lineCap: 'round', lineJoin: 'round', tension: 0.5,
    });
    renderer!.previewLayer.add(line);
    renderer!.previewLayer.batchDraw();
  } else if (['circle', 'rectangle', 'arrows', 'line'].includes(m) && startPos) {
    renderer!.previewLayer.destroyChildren();
    drawTempShape(pos, !!e?.evt?.shiftKey);
    renderer!.previewLayer.batchDraw();
  } else if (m === 'move' && startPos) {
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    const newX = renderer!.layer.x() + dx;
    const newY = renderer!.layer.y() + dy;
    renderer!.setViewport(newX, newY);
    provider?.setViewportOffset(newX, newY);
    startPos = pos;
  }

  provider?.updateCursor({ userId, userName: displayName, x: pos.x, y: pos.y, color: userColor });
}

function onPointerUp(e: any) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getPointerPos(e);
  // 只清预览层：tempLayer 上的选中框/手柄（transformer）不能被绘制清理连带销毁
  renderer!.previewLayer.destroyChildren();
  renderer!.previewLayer.batchDraw();
  const m = mode.value;

  if (m !== 'move') redoStack.value = [];
  // 同步尚未完成时 pages 可能未播种，否则 addShape 静默丢弃；与图片添加一致先兜底建页
  if (provider && !provider.getActiveElements() && ['brush', 'eraser', 'circle', 'rectangle', 'arrows', 'line'].includes(m)) {
    provider.addPage();
  }

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
    const rx = Math.abs(dx);
    const ry = Math.abs(dy);
    const shift = !!e?.evt?.shiftKey;
    // 自由拖 = 椭圆（横纵半径分别取 |dx|/|dy|，起点为圆心）；Shift = 正圆（取较大值）
    const radius = Math.max(rx, ry);
    if (Math.max(rx, ry) > 2) {
      const shapeData: Record<string, any> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'circle', x: layerStart.x, y: layerStart.y,
        color: currentColor.value, lineWidth: currentSize.value,
        opacity: currentOpacity.value,
        ...(shift ? { radius } : { radiusX: rx, radiusY: ry }),
      };
      provider?.addShape(shapeData);
      refreshLayer();
      undoStack.value.push({ type: 'addShape', pageId: provider!.getCurrentPageId(), pageIndex: renderer!.getCurrentPageIndex(), shapeData });
    }
  } else if (m === 'line' && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    let dx = layerEnd.x - layerStart.x;
    let dy = layerEnd.y - layerStart.y;
    const shift = !!e?.evt?.shiftKey;
    // Shift 锁定水平/垂直（按主方向取舍，与直线预览一致）
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      const shapeData: Record<string, any> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'line',
        points: [layerStart.x, layerStart.y, layerStart.x + dx, layerStart.y + dy],
        color: currentColor.value, lineWidth: currentSize.value,
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

function drawTempShape(pos: { x: number; y: number }, shift: boolean) {
  if (!startPos || !renderer) return;
  const m = mode.value;
  // 预览节点存层局部坐标（previewLayer 与 layer 同变换），与最终落盘完全一致
  const ls = toLayerCoords(startPos);
  const le = toLayerCoords(pos);

  if (m === 'rectangle') {
    renderer.previewLayer.add(new Konva.Rect({
      x: Math.min(ls.x, le.x), y: Math.min(ls.y, le.y),
      width: Math.abs(le.x - ls.x), height: Math.abs(le.y - ls.y),
      stroke: currentColor.value, strokeWidth: currentSize.value,
    }));
  } else if (m === 'circle') {
    const dx = le.x - ls.x;
    const dy = le.y - ls.y;
    if (shift) {
      // Shift 约束为正圆（取较大值），与 Konva Transformer 的 Shift 行为一致
      renderer.previewLayer.add(new Konva.Circle({
        x: ls.x, y: ls.y, radius: Math.max(Math.abs(dx), Math.abs(dy)),
        stroke: currentColor.value, strokeWidth: currentSize.value,
      }));
    } else {
      renderer.previewLayer.add(new Konva.Ellipse({
        x: ls.x, y: ls.y, radiusX: Math.abs(dx), radiusY: Math.abs(dy),
        stroke: currentColor.value, strokeWidth: currentSize.value,
      }));
    }
  } else if (m === 'line') {
    let dx = le.x - ls.x;
    let dy = le.y - ls.y;
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    renderer.previewLayer.add(new Konva.Line({
      points: [ls.x, ls.y, ls.x + dx, ls.y + dy],
      stroke: currentColor.value, strokeWidth: currentSize.value,
      lineCap: 'round', lineJoin: 'round',
    }));
  } else if (m === 'arrows') {
    renderer.previewLayer.add(new Konva.Arrow({
      points: [ls.x, ls.y, le.x, le.y],
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
      applyShapeUpdate(action.shapeId!, action.before!, action.after!);
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
      applyShapeUpdate(action.shapeId!, action.after!, action.before!);
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
// 把教师端当前视口（缩放 + 平移，移动工具与全览共用 x/y 通道）写入 Yjs，学生端观察器跟随应用
function syncViewportToYjs() {
  if (!renderer || !provider) return;
  provider.setViewportZoom(renderer.getZoom());
  const view = renderer.getView();
  provider.setViewportOffset(view.x, view.y);
}

function layerZoomChange(type: string) {
  if (!renderer) return;
  if (type === 'sub') zoomLevel.value = renderer.zoomOut();
  else if (type === 'add') zoomLevel.value = renderer.zoomIn();
  else if (type === 'all') { renderer.zoomFitAll(); zoomLevel.value = renderer.getZoom(); }
  syncViewportToYjs();
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
  syncViewportToYjs();
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
  // 删除目标若是课件页 → 该课件全部页一起移除，条目回到「未打开」态（课件是整体）；
  // 判断须先于 pageCount<=1 的 layerClear 兜底，单页课件是唯一画布时也能整套重置
  const pages = provider?.getPages();
  const pid =
    pages && index - 1 >= 0 && index - 1 < pages.length
      ? String(pages.get(index - 1).get('id'))
      : '';
  const deckIdx = pid
    ? fileList.value.findIndex(f => f.fileid.split(',').filter(Boolean).includes(pid))
    : -1;
  if (deckIdx >= 0) {
    removePagesByIds(fileList.value[deckIdx]!.fileid.split(',').filter(Boolean));
    provider?.setFileItemId(deckIdx, '');
    fileList.value = provider!.getFileList();
    toast('已删除课件页');
    emitPaintLog();
    return;
  }
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
  // 选中状态下改色 → 同步写回所选图形（入 undo 栈）
  commitSelectedStyle({ color });
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
function editSizeEnd() {
  commitSizeStyle();
  sizeDragging = false;
}
function editLeave() {
  if (sizeDragging) commitSizeStyle();
  sizeDragging = false;
}
// 拖拽结束时把最终粗细/字号写回所选图形（拖拽过程只动本地值，避免连环入栈）
function commitSizeStyle() {
  if (sizeTargetsText()) commitSelectedStyle({ fontSize: textSize.value });
  else commitSelectedStyle({ lineWidth: currentSize.value });
}

// --- Fill (仅矩形/圆形)：二态切换——填充(取当前描边色) / 无填充(删 fill 字段) ---
function toggleFill() {
  if (!props.isTeacher || mode.value !== 'cur') return;
  fillEnabled.value = !fillEnabled.value;
  if (fillEnabled.value) commitSelectedStyle({ fill: currentColor.value });
  else commitSelectedStyle({}, ['fill']);
}

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
// 松手（change）才写回所选图形，拖动过程仅本地预览
function onOpacityChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  commitSelectedStyle({ opacity: val });
}
function onPanelOpacityInput(e: Event) {
  panelOpacity.value = parseFloat((e.target as HTMLInputElement).value);
}
function updateSizeFromMouse(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = Math.max(0, Math.min(130, e.clientX - rect.left));
  sizeBtnLeft.value = x;
  const size = sizeTargetsText() ? Math.round(8 + (x / 130) * 40) : Math.round(1 + (x / 130) * 19);
  if (sizeTargetsText()) {
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

    // 阶段2：零建页 —— 先登记服务端（保持「doc 条目 ⟺ 服务端记录」不变量，进房对账才安全），
    // 成功才入列表（fileid 留空），点击列表时才创建课件页（见 openCourseware）；
    // 上传前后画布与当前页保持原样
    const ext = file.name.split('.').pop() || 'ppt';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const registered = await saveCoursewareRecord({
      filename: baseName,
      filext: ext,
      filesize: file.size,
      fileUrl,
    });
    if (!registered) {
      toast('课件登记服务端失败，请重试');
      return false;
    }
    provider?.addFileItem({
      filename: baseName, filext: ext, filesize: file.size, fileid: '',
      fileurl: fileUrl,
    });
    fileList.value = provider!.getFileList();
    toast(`PPT已导入，共${meta.numPages}页，请点击列表打开`);
    return true;
  } catch (e) {
    toast(`PPT上传出错: ${(e as Error).message}`);
    return false;
  } finally {
    loading.value = false;
  }
}

// 登记到服务端课件表（房内上传与进房前上传共用同一张表）；
// 返回是否成功 —— 调用方据此决定是否入列表，维持「doc 条目 ⟺ 服务端记录」不变量
async function saveCoursewareRecord(item: {
  filename: string;
  filext: string;
  filesize: number;
  fileUrl: string;
}): Promise<boolean> {
  try {
    await Live.save_courseware({ roomId: props.roomId, ...item });
    return true;
  } catch (e) {
    console.error('课件登记失败', e);
    return false;
  }
}

// 进房自动登记服务端课件（仅教师，首次 synced 后触发）：
// 先对账 —— 服务端已删的 doc 条目（如在「我的直播」对话框中删除）连同其课件页一并移除，
// 仅在拉取成功时执行（失败上方已 return），避免网络错误误删；
// 再按 fileurl 去重登记（含已登记未建页的条目）—— 仅入列表零建页，点击列表才创建课件页
async function importServerCoursewares() {
  if (!provider || !props.isTeacher) return;
  const res = await Live.courseware_list(props.roomId).catch((e: unknown) => {
    console.error('课件列表拉取失败', e);
    return null;
  });
  if (!res) return;
  const items: Array<{ id: string; filename: string; filext: string; filesize: number; fileUrl: string }> =
    res.data.data?.list ?? [];

  // 对账清幽灵：doc 里 fileurl 不在服务端集合的条目 = 已在服务端被删除
  const serverUrls = new Set(items.map(it => it.fileUrl).filter(Boolean));
  const ghosts = provider
    .getFileList()
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => !!f.fileurl && !serverUrls.has(f.fileurl));
  let prunedPages = false;
  for (const { f, idx } of ghosts.reverse()) {
    if (f.fileid) {
      removePagesByIds(f.fileid.split(',').filter(Boolean));
      prunedPages = true;
    }
    provider.removeFileItem(idx);
  }
  if (prunedPages) showLayer(1);

  const existing = new Set(provider.getFileList().map(i => i.fileurl).filter(Boolean));
  const pending = items.filter(it => it.fileUrl && !existing.has(it.fileUrl));
  if (ghosts.length === 0 && pending.length === 0) return;

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

// 点击课件列表：已有页（历史/已创建）直接导航；页不存在（僵尸 fileid/历史页被删）
// 或未建页则创建课件页并展示
async function openCourseware(item: FileItem, index: number) {
  if (!provider || !renderer) return;
  // 页存在 → 导航结束；不存在 → 落入创建路径自愈重建
  if (item.fileid && showFile(item.fileid)) return;
  if (!props.isTeacher) {
    toast('仅教师可加载课件');
    return;
  }
  if (loading.value) return; // 防双击重复建页
  const fileUrl = item.fileurl;
  if (!fileUrl) {
    toast(item.fileid ? '课件页面已不存在' : '课件地址缺失');
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
    // 回填 fileid：index 即原始 Y.Array 索引（列表未过滤），顺带覆盖僵尸 id
    provider.setFileItemId(index, layerIds.join(','));
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

// 按 fileid 导航到课件首页：页存在返回 true；已不存在返回 false（由调用方自愈重建）
function showFile(ids: string): boolean {
  try {
    if (!ids) return false;
    const arr = ids.split(',').filter(Boolean);
    if (arr.length === 0 || !provider || !renderer) return false;
    const firstId = arr[0];
    const pages = provider.getPages();
    for (let i = 0; i < pages.length; i++) {
      const pid = String(pages.get(i).get('id'));
      if (pid === firstId) {
        showLayer(i + 1);
        showFileList.value = false;
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function alterFName(i: number, e: Event) {
  const val = (e.target as HTMLInputElement).value.trim();
  if (!val) { toast('名字不能为空!'); return; }
  provider?.renameFileItem(i, val);
  fileList.value = provider!.getFileList();
  editFileIndex.value = -1;
}

async function delFile(i: number) {
  const item = fileList.value[i];
  if (!item) return;
  // 服务端同步：按 fileurl 定位记录后删除（Yjs 条目不存服务端 id），避免重进房被 courseware_list 复活。
  // 服务端失败则中止本地删除（两侧一致、可重试）；查无记录视为已删，直接走本地删除
  if (item.fileurl) {
    try {
      const res = await Live.courseware_list(props.roomId);
      const list: Array<{ id: string; fileUrl: string }> = res.data.data?.list ?? [];
      const hit = list.find(r => r.fileUrl === item.fileurl);
      if (hit?.id) await Live.delete_courseware(hit.id);
    } catch (e) {
      console.error('服务端课件记录删除失败', e);
      toast('服务端课件记录删除失败，请重试');
      return;
    }
  }
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
  delLayer,
  setFileItemId: (index: number, fileid: string) => {
    provider?.setFileItemId(index, fileid);
    fileList.value = provider!.getFileList();
  },
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
  toLayerCoords,
  // 测试钩子：直接访问底层 Yjs provider / Konva renderer / 当前视口快照（供同步类用例断言）
  get provider() {
    return provider;
  },
  get renderer() {
    return renderer;
  },
  viewState: () => ({
    zoom: renderer?.getZoom() ?? 100,
    layerScale: renderer?.layer.scaleX() ?? 1,
    x: renderer?.layer.x() ?? 0,
    y: renderer?.layer.y() ?? 0,
    stageX: renderer?.getStage().x() ?? 0,
    stageY: renderer?.getStage().y() ?? 0,
  }),
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
.cursor-laser { cursor: crosshair; }

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
  .fill-bar { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: #666;
    .fill-label { white-space: nowrap; }
    .fill-toggle { padding: 2px 10px; border-radius: 10px; background: #eee; color: #666; cursor: pointer; border: 1px solid #ddd; user-select: none;
      &.on { background: #409eff; color: #fff; border-color: #409eff; }
    }
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
