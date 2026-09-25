<template>
  <div class="whiteboard-container">
    <div class="toolbar">
      <div class="tool-group">
        <button
          v-for="tool in tools"
          :key="tool.type"
          :class="['tool-btn', { active: currentTool === tool.type }]"
          @click="selectTool(tool.type)"
        >
          {{ tool.icon }}
        </button>
      </div>
      <div class="color-group">
        <div
          v-for="color in colors"
          :key="color"
          class="color-btn"
          :style="{ backgroundColor: color }"
          @click="selectColor(color)"
        />
      </div>
      <div class="size-group">
        <button @click="decreaseSize">
          -
        </button>
        <span>{{ currentSize }}</span>
        <button @click="increaseSize">
          +
        </button>
      </div>
      <div class="action-group">
        <button
          class="clear-btn"
          @click="clearPage"
        >
          Clear
        </button>
      </div>
    </div>
    <div
      ref="canvasRef"
      class="canvas-container"
    />
  </div>
</template>

<script setup lang="ts">
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Yjs + Konva + y-websocket types handled at runtime
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { YjsProvider } from './YjsProvider';
import { KonvaRenderer } from './KonvaRenderer';
import { ToolState, DEFAULT_TOOL } from './types';
import { BrushTool } from './tools/BrushTool';
import { EraserTool } from './tools/EraserTool';
import { RectTool } from './tools/RectTool';
import { CircleTool } from './tools/CircleTool';
import { ArrowTool } from './tools/ArrowTool';
import { TextTool } from './tools/TextTool';
import { SelectTool } from './tools/SelectTool';
import { PanTool } from './tools/PanTool';
import { BaseTool } from './tools/BaseTool';

const props = defineProps<{
  roomId: string;
  userId: string;
  userName: string;
  isTeacher: boolean;
}>();

const canvasRef = ref<HTMLElement>();
const currentTool = ref<ToolState['type']>(DEFAULT_TOOL.type);
const currentColor = ref(DEFAULT_TOOL.color);
const currentSize = ref(DEFAULT_TOOL.lineWidth);

const tools = [
  { type: 'brush', icon: 'Pen' },
  { type: 'eraser', icon: 'Eraser' },
  { type: 'rect', icon: 'Rect' },
  { type: 'circle', icon: 'Circle' },
  { type: 'arrow', icon: 'Arrow' },
  { type: 'text', icon: 'Text' },
  { type: 'select', icon: 'Select' },
  { type: 'pan', icon: 'Move' },
];

const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

let provider: YjsProvider | null = null;
let renderer: KonvaRenderer | null = null;
let activeTool: BaseTool | null = null;
const toolInstances = new Map<string, BaseTool>();

const userColor = (() => {
  const hue = Math.abs(hashCode(props.userId)) % 360;
  return `hsl(${hue}, 70%, 50%)`;
})();

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function createTools(stage: any, mainLayer: any, tempLayer: any, shapes: any) {
  const config = { color: currentColor.value, lineWidth: currentSize.value, fontSize: currentSize.value };

  const brush = new BrushTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  brush.setConfig(config);
  toolInstances.set('brush', brush);

  const eraser = new EraserTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  eraser.setConfig(config);
  toolInstances.set('eraser', eraser);

  const rect = new RectTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  rect.setConfig(config);
  toolInstances.set('rect', rect);

  const circle = new CircleTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  circle.setConfig(config);
  toolInstances.set('circle', circle);

  const arrow = new ArrowTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  arrow.setConfig(config);
  toolInstances.set('arrow', arrow);

  const text = new TextTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  text.setConfig(config);
  toolInstances.set('text', text);

  const select = new SelectTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  toolInstances.set('select', select);

  const pan = new PanTool(stage, mainLayer, tempLayer, shapes, props.roomId);
  toolInstances.set('pan', pan);

  return brush;
}

onMounted(() => {
  if (!canvasRef.value || !props.roomId) return;

  provider = new YjsProvider(
    props.roomId,
    props.userId,
    props.userName,
    userColor,
  );

  renderer = new KonvaRenderer(canvasRef.value);
  renderer.bindShapes(provider.getShapes());

  const stage = renderer.getStage();
  activeTool = createTools(stage, renderer.layer, renderer.tempLayer, provider.getShapes());
  activeTool.setConfig({ color: currentColor.value, lineWidth: currentSize.value, fontSize: currentSize.value });

  stage.on('mousedown touchstart', (e: any) => activeTool?.onPointerDown(e));
  stage.on('mousemove touchmove', (e: any) => {
    activeTool?.onPointerMove(e);
    // Update cursor for awareness
    const pos = activeTool?.getPointerPos(e);
    if (pos) {
      provider?.updateCursor({
        userId: props.userId,
        userName: props.userName,
        x: pos.x,
        y: pos.y,
        color: userColor,
      });
    }
  });
  stage.on('mouseup touchend', (e: any) => activeTool?.onPointerUp(e));

  const resizeObserver = new ResizeObserver(() => {
    if (canvasRef.value && renderer) {
      renderer.resize(canvasRef.value.clientWidth, canvasRef.value.clientHeight);
    }
  });
  resizeObserver.observe(canvasRef.value);

  watch([currentTool, currentColor, currentSize], () => {
    provider?.setToolState({
      type: currentTool.value,
      color: currentColor.value,
      lineWidth: currentSize.value,
    });
    const tool = toolInstances.get(currentTool.value);
    if (tool) {
      tool.setConfig({ color: currentColor.value, lineWidth: currentSize.value, fontSize: currentSize.value });
      activeTool = tool;
    }
  });
});

onUnmounted(() => {
  toolInstances.forEach((tool) => tool.destroy());
  renderer?.destroy();
  provider?.destroy();
});

function selectTool(tool: ToolState['type']) {
  currentTool.value = tool;
}

function selectColor(color: string) {
  currentColor.value = color;
}

function increaseSize() {
  currentSize.value = Math.min(currentSize.value + 1, 20);
}

function decreaseSize() {
  currentSize.value = Math.max(currentSize.value - 1, 1);
}

function clearPage() {
  provider?.clearAllShapes();
}

defineExpose({
  clearPage,
  selectTool,
});
</script>

<style scoped lang="less">
.whiteboard-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.tool-group {
  display: flex;
  gap: 4px;
}

.tool-btn {
  padding: 6px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e0e0e0;
  }

  &.active {
    background: #409eff;
    color: #fff;
    border-color: #409eff;
  }
}

.color-group {
  display: flex;
  gap: 4px;
}

.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.1);
  }
}

.size-group {
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    width: 24px;
    height: 24px;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  span {
    min-width: 24px;
    text-align: center;
  }
}

.action-group {
  margin-left: auto;
}

.clear-btn {
  padding: 6px 12px;
  border: 1px solid #ff4444;
  border-radius: 4px;
  background: #fff;
  color: #ff4444;
  cursor: pointer;

  &:hover {
    background: #ff4444;
    color: #fff;
  }
}

.canvas-container {
  flex: 1;
  overflow: hidden;
}
</style>
