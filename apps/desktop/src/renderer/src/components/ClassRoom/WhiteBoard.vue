<template>
  <div class="classroom-white-board">
    <div class="whiteBoard">
      <div
        :id="containerId"
        :class="['container', 'cursor-' + mode]"
        :style="showFileList ? 'pointer-events: none' : ''"
      />

      <!-- 左侧工具面板 -->
      <div v-if="isTeacher && isDisplay" class="tools">
        <el-tooltip
          content="选择器 · 拖动移动，拉手柄缩放（Shift 等比，Delete 删除）"
          placement="right"
        >
          <div :class="['cur', { on: mode === 'cur' }]" @click="tool('cur')">
            <el-icon><Pointer /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="画笔 · 上钢笔 / 下荧光笔（笔型记忆）" placement="right">
          <div class="brush-seg" :class="{ on: mode === 'brush' }">
            <div
              class="seg seg-pen"
              :class="{ active: penType === 'pen' }"
              @click="selectPen('pen')"
            >
              <el-icon><EditPen /></el-icon>
            </div>
            <div
              class="seg seg-hl"
              :class="{ active: penType === 'highlight' }"
              @click="selectPen('highlight')"
            >
              <el-icon><BrushFilled /></el-icon>
            </div>
          </div>
          <!-- F4.2：笔型工具子菜单——手绘图形规整开关 -->
          <el-popover placement="right-end" :width="168" trigger="click">
            <template #reference>
              <div class="seg-menu" :class="{ on: mode === 'brush' }">
                <el-icon><MoreFilled /></el-icon>
              </div>
            </template>
            <div class="seg-menu-item">
              <span>手绘规整</span>
              <el-switch :model-value="regularizeEnabled" @change="toggleRegularize()" />
            </div>
          </el-popover>
        </el-tooltip>
        <el-tooltip content="文本工具" placement="right">
          <div :class="['text', { on: mode === 'text' }]" @click="tool('text')">
            <el-icon><Edit /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="圆形工具 · 拖拽画椭圆，按住 Shift 画正圆" placement="right">
          <div :class="['circle', { on: mode === 'circle' }]" @click="tool('circle')" />
        </el-tooltip>
        <el-tooltip content="矩形工具" placement="right">
          <div :class="['rectangle', { on: mode === 'rectangle' }]" @click="tool('rectangle')" />
        </el-tooltip>
        <el-tooltip content="箭头工具" placement="right">
          <div :class="['arrows', { on: mode === 'arrows' }]" @click="tool('arrows')">
            <el-icon><Promotion /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="受力箭头 · 预设标签拖出方向，双击改标签" placement="right">
          <div :class="['force', { on: mode === 'force' }]">
            <el-popover placement="right-end" :width="176" trigger="click">
              <template #reference>
                <span class="force-icon">F</span>
              </template>
              <div class="force-presets">
                <span
                  v-for="p in FORCE_PRESETS"
                  :key="p"
                  class="force-preset"
                  @click="selectForceLabel(p)"
                >
                  {{ p }}
                </span>
              </div>
            </el-popover>
          </div>
        </el-tooltip>
        <el-tooltip content="引线标注 · 点击被指对象拖出标签，双击改文字" placement="right">
          <div :class="['leader-tool', { on: mode === 'leader' }]" @click="selectLeader()">
            <el-icon><Right /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip
          content="表格 · 点击落点插入 3×3，选中后增删行列，双击编辑单元格"
          placement="right"
        >
          <div :class="['table-tool', { on: mode === 'table' }]" @click="tool('table')">
            <el-icon><Grid /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="直线工具 · 按住 Shift 锁定水平/垂直" placement="right">
          <div :class="['line', { on: mode === 'line' }]" @click="tool('line')">
            <el-icon><Minus /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="公式 · LaTeX 输入（Enter 提交，Esc 取消）" placement="right">
          <div class="formula-tool" @click="openFormula">
            <span class="formula-tool-icon">∑</span>
          </div>
        </el-tooltip>
        <el-tooltip content="橡皮擦 · 按整笔擦除（含荧光笔迹）" placement="right">
          <div :class="['eraser', { on: mode === 'eraser' }]" @click="tool('eraser')" />
        </el-tooltip>
        <el-tooltip content="拖动工具" placement="right">
          <div :class="['move', { on: mode === 'move' }]" @click="tool('move')" />
        </el-tooltip>
        <el-tooltip content="激光笔 · 红点跟指，切换工具或 Esc 熄灭" placement="right">
          <div :class="['laser', { on: mode === 'laser' }]" @click="toggleLaser">
            <el-icon><Aim /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="上传图片 · 贴到当前页" placement="right">
          <div class="picture">
            <el-icon><Picture /></el-icon>
            <input
              type="file"
              accept="image/x-png,image/gif,image/jpeg,image/jpg,image/bmp"
              @change="takeFile"
            />
          </div>
        </el-tooltip>
        <el-tooltip content="截图 · Ctrl+Shift+X 框选屏幕区域插入" placement="right">
          <div class="screenshot-tool" @click="startScreenshot">
            <el-icon><Crop /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="我的课件" placement="right">
          <div :class="['file', { on: mode === 'file' }]" @click="toggleFileList">
            <el-icon><FolderOpened /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="导出板书 · PNG/PDF（仅教师）" placement="right">
          <div class="export" @click="openExportDialog">
            <el-icon><Download /></el-icon>
          </div>
        </el-tooltip>
      </div>

      <!-- 底部控制栏（仅教师：撤销/清空/缩放均写入或影响共享白板） -->
      <div v-if="isTeacher" class="ctrl-tools">
        <el-tooltip content="撤回上一步" placement="top">
          <div class="pre" @click="revocation('pre')">
            <el-icon><RefreshLeft /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="返回下一步" placement="top">
          <div class="next" @click="revocation('next')">
            <el-icon><RefreshRight /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="清空当前画布" placement="top">
          <div class="clear" @click="layerClear" />
        </el-tooltip>
        <el-tooltip content="缩小画布" placement="top">
          <div class="sub" @click="layerZoomChange('sub')">
            <el-icon><ZoomOut /></el-icon>
          </div>
        </el-tooltip>
        <div class="num" @click="editZoom">
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
          />
        </div>
        <el-tooltip content="放大画布" placement="top">
          <div class="add" @click="layerZoomChange('add')">
            <el-icon><ZoomIn /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="画布全览" placement="top">
          <div class="all" @click="layerZoomChange('all')">
            <el-icon><FullScreen /></el-icon>
          </div>
        </el-tooltip>
      </div>

      <!-- 底部页面栏（仅教师：增删页/翻页写入共享文档并强制其他端跟随） -->
      <div v-if="isTeacher" class="page-tools">
        <el-tooltip content="删除画布" placement="top">
          <div class="del" @click="delLayer(curLayerIndex)">
            <el-icon><Delete /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="首个画布" placement="top">
          <div class="first" @click="showLayer(1)">
            <el-icon><DArrowLeft /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="上一画布" placement="top">
          <div class="pre" @click="showLayer(curLayerIndex - 1)">
            <el-icon><ArrowLeft /></el-icon>
          </div>
        </el-tooltip>
        <div class="num">{{ curLayerIndex }}/{{ layerIndex }}</div>
        <el-tooltip content="下一画布" placement="top">
          <div class="next" @click="showLayer(curLayerIndex + 1)">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="末尾画布" placement="top">
          <div class="last" @click="showLayer(layerIndex)">
            <el-icon><DArrowRight /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="新增画布" placement="top">
          <div class="add" @click="addLayer">
            <el-icon><Plus /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="页面总览 · 缩略图快速跳页" placement="top">
          <div :class="['overview', { on: showThumbPanel }]" @click="toggleThumbPanel">
            <el-icon><Grid /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="课后回看 · 查看历史板书快照（仅教师）" placement="top">
          <div class="review" @click="showBoardReview = true">
            <el-icon><Clock /></el-icon>
          </div>
        </el-tooltip>
      </div>

      <!-- F5.2：页面缩略图总览浮层（覆盖层，不改画布布局；当前页高亮，点击跳页） -->
      <div v-if="showThumbPanel" class="thumb-panel">
        <div class="thumb-panel-title">页面总览</div>
        <div class="thumb-grid">
          <div
            v-for="p in thumbPages"
            :key="p.id"
            :class="['thumb-item', { on: p.current }]"
            @click="jumpToThumb(p.index)"
          >
            <div class="thumb-ph">{{ p.index + 1 }}</div>
            <div class="thumb-num">{{ p.index + 1 }}</div>
          </div>
        </div>
      </div>

      <!-- F6.3 课后回看：只读快照查看浮层（覆盖层；Q4 MVP 仅教师） -->
      <BoardReview v-if="showBoardReview" :room-id="roomId" @close="showBoardReview = false" />

      <!-- 可拖拽颜色面板 -->
      <div
        v-show="showEditer && !colorPanelCollapsed"
        class="color-panel"
        :style="{
          transform: `translate(${colorPanelX}px, ${colorPanelY}px)`,
          opacity: panelOpacity
        }"
        @mouseenter="cancelCloseColorPanel"
        @mouseleave="startCloseColorPanel"
      >
        <div class="color-panel-drag" @mousedown="onColorPanelDragStart" />
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
            <div class="strip-btn" :style="{ left: sizeBtnLeft + 'px' }" />
          </div>
        </div>
        <!-- F4.3：文本样式行（粗斜/对齐），仅文本模式或选中文本时显示 -->
        <div v-if="sizeTargetsText()" class="text-style">
          <div :class="['ts-btn', { on: selBold }]" @click="toggleTextStyle('bold')"><b>B</b></div>
          <div :class="['ts-btn', { on: selItalic }]" @click="toggleTextStyle('italic')">
            <i>I</i>
          </div>
          <div class="ts-sep" />
          <div
            v-for="a in alignOptions"
            :key="a.value"
            :class="['ts-btn', 'ts-align', { on: selAlign === a.value }]"
            :title="a.label"
            @click="setSelAlign(a.value)"
          >
            {{ a.label }}
          </div>
        </div>
        <!-- F4.5：对齐吸附开关（触屏无键盘时的 Alt 替代入口），拖动生效 -->
        <div class="snap-bar">
          <span class="snap-label">吸附</span>
          <el-switch :model-value="snapEnabled" @change="toggleSnap()" />
        </div>
        <!-- F4.4：表格行列操作（选中表格时显示） -->
        <div v-if="selIsTable" class="table-ops">
          <div class="top-btn" @click="tableOp('addRow')">+行</div>
          <div class="top-btn" @click="tableOp('removeRow')">-行</div>
          <div class="top-btn" @click="tableOp('addCol')">+列</div>
          <div class="top-btn" @click="tableOp('removeCol')">-列</div>
        </div>
        <div class="edit-color">
          <div
            v-for="(c, i) in presetColors"
            :key="i"
            :class="['item', { on: currentColor === c }]"
            :style="{ background: c }"
            @click="selectColor(c)"
          />
          <div class="item colours" @click="showPallet = !showPallet" />
        </div>
        <div v-if="showFillToggle" class="fill-bar">
          <span class="fill-label">填充</span>
          <div :class="['fill-toggle', { on: fillEnabled }]" @click="toggleFillPalette">
            <span v-if="fillEnabled" class="fill-swatch" :style="{ background: fillColor }" />
            {{ fillEnabled ? '已填充' : '无填充' }}
          </div>
          <Transition name="wb-pop">
            <div v-if="showFillPalette" class="fill-palette pallet-box">
              <div class="fp-row">
                <div
                  v-for="c in presetColors"
                  :key="c"
                  :class="['fp-item', { on: fillColor === c }]"
                  :style="{ background: c }"
                  @click="pickFillColor(c)"
                />
                <div class="fp-none" @click="clearFillColor">无颜色</div>
              </div>
              <div class="pal-color fpal-color">
                <canvas
                  ref="fillWheelRef"
                  width="150"
                  height="150"
                  @mousedown="startWheelPick($event, 'fill')"
                />
                <div
                  class="pal-btn"
                  :style="{ left: fpalBtnLeft + 'px', top: fpalBtnTop + 'px' }"
                />
              </div>
            </div>
          </Transition>
        </div>
        <Transition name="wb-pop">
          <div v-show="showPallet" class="pallet-box">
            <div class="pal-color">
              <canvas
                ref="strokeWheelRef"
                width="150"
                height="150"
                @mousedown="startWheelPick($event, 'stroke')"
              />
              <div class="pal-btn" :style="{ left: palBtnLeft + 'px', top: palBtnTop + 'px' }" />
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
        </Transition>
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
          />
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
          />
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
        <div class="color-dot" :style="{ background: currentColor }" />
      </div>

      <!-- 课件列表 -->
      <div v-show="showFileList" class="fileList">
        <div class="file-upload">
          <el-icon><Upload /></el-icon>
          <span>上传PPT课件</span>
          <input type="file" accept=".ppt,.pptx" @change="takeFile" />
        </div>
        <div v-for="(item, i) in fileList" :key="i" class="file-item">
          <div class="file-name" @click="openCourseware(item, i)">
            <span v-if="editFileIndex !== i">{{ item.filename }}.{{ item.filext }}</span>
            <input
              v-else
              :value="item.filename"
              class="file-name-input"
              @keyup.enter="alterFName(i, $event)"
              @blur="alterFName(i, $event)"
            />
          </div>
          <div class="file-size">
            {{ formatFileSize(item.filesize) }}
          </div>
          <el-icon class="file-del" aria-label="删除" @click.stop="delFile(i)">
            <Delete />
          </el-icon>
        </div>
        <div class="file-hint">
          图片贴到当前页；点击课件列表创建并打开课件页，重进直播间自动恢复
        </div>
      </div>

      <!-- F1.1 公式输入浮层（状态机：默认→输入中→非法红框→渲染中→已提交自动关闭；
           面板互斥：与属性面板/课件页签互斥单开） -->
      <div v-if="formulaVisible" class="formula-overlay" @mousedown.self="closeFormula">
        <div class="formula-panel">
          <div class="formula-title">{{ editingFormulaId ? '编辑公式' : '插入公式' }}（LaTeX）</div>
          <textarea
            ref="formulaInputRef"
            v-model="formulaInput"
            class="formula-textarea"
            :class="{ invalid: !!formulaError }"
            rows="3"
            placeholder="例：\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
            @input="formulaError = ''"
            @keydown.enter.exact.prevent="submitFormula"
            @keydown.esc.stop.prevent="closeFormula"
          />
          <div v-if="formulaError" class="formula-error">{{ formulaError }}</div>
          <div v-else-if="formulaLoading" class="formula-loading">渲染中…</div>
          <!-- F1.2 化学模式开关：开启后裸化学输入提交时自动包裹 \ce{} -->
          <div class="formula-chem">
            <el-switch v-model="chemMode" size="small" />
            <span class="formula-chem-label">化学模式（\ce{}）</span>
          </div>
          <!-- F1.3 符号快捷面板：分组页签 + 点击插入光标处 -->
          <div class="formula-symbols">
            <div class="formula-symbol-tabs">
              <button
                v-for="g in SYMBOL_GROUPS"
                :key="g.id"
                type="button"
                class="formula-symbol-tab"
                :class="{ on: activeSymbolGroup === g.id }"
                @click="activeSymbolGroup = g.id"
              >
                {{ g.label }}
              </button>
            </div>
            <div class="formula-symbol-grid">
              <button
                v-for="sym in SYMBOL_GROUPS.find(g => g.id === activeSymbolGroup)?.symbols ?? []"
                :key="sym"
                type="button"
                class="formula-symbol-btn"
                @click="insertSymbol(sym)"
              >
                {{ sym }}
              </button>
            </div>
          </div>
          <div class="formula-actions">
            <el-button size="small" @click="closeFormula">取消</el-button>
            <el-button size="small" type="primary" :loading="formulaLoading" @click="submitFormula">
              {{ formulaError ? '重试' : '提交' }}
            </el-button>
          </div>
          <div class="formula-hint">Enter 提交 · Esc 取消 · 双击已有公式重新编辑</div>
        </div>
      </div>

      <!-- Loading -->
      <div v-show="loading" class="loading-div" @click.stop>
        <el-icon class="loading-gif is-loading" :size="48">
          <Loading />
        </el-icon>
      </div>

      <!-- 快照暂存失败横幅（§4.9 F6.2 失败态：可见提示+服务端自动重试） -->
      <div v-if="snapshotRetry !== null" class="snapshot-banner">
        板书暂存失败，重试中(第 {{ snapshotRetry }} 次)
      </div>

      <!-- F7.5 跟随冲突横幅：学生手动缩放被教师视口覆盖时提示，5s 自动消失；点击恢复手动 -->
      <div v-if="followBanner" class="snapshot-banner follow-banner" @click="onFollowBannerClick">
        已回到教师视角（点击恢复手动）
      </div>

      <!-- F4.6 截图框选遮罩：全窗展示屏幕捕获，拖拽框选后按框选原位插入图片元素 -->
      <div
        v-if="screenshotVisible"
        class="screenshot-overlay"
        @mousedown="onShotMouseDown"
        @mousemove="onShotMouseMove"
        @mouseup="onShotMouseUp"
      >
        <img :src="screenshotImg" class="screenshot-bg" draggable="false" alt="" />
        <div v-if="shotSel" class="screenshot-sel" :style="shotSelStyle" />
      </div>

      <!-- 板书导出（F6.1，仅教师）：范围/格式 + 逐页进度 + 失败留弹窗可重试 -->
      <el-dialog
        v-model="exportDialogVisible"
        title="导出板书"
        width="380px"
        append-to-body
        :close-on-click-modal="!exporting"
      >
        <div class="export-row">
          <span class="export-label">范围</span>
          <el-radio-group v-model="exportScope" :disabled="exporting">
            <el-radio :value="'current'">当前页（第 {{ curLayerIndex }} 页）</el-radio>
            <el-radio :value="'all'">全部（{{ layerIndex }} 页）</el-radio>
          </el-radio-group>
        </div>
        <div class="export-row">
          <span class="export-label">格式</span>
          <el-radio-group v-model="exportFormat" :disabled="exporting">
            <el-radio :value="'png'">PNG</el-radio>
            <el-radio :value="'pdf'">PDF</el-radio>
          </el-radio-group>
        </div>
        <div v-if="exportScope === 'all' && exportFormat === 'png'" class="export-hint">
          全部页 PNG 将打包为 ZIP 保存
        </div>
        <div v-if="exporting && exportProgress" class="export-progress">
          导出中 {{ exportProgress.done }}/{{ exportProgress.total }}…
        </div>
        <template #footer>
          <el-button :disabled="exporting" @click="exportDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="exporting" @click="confirmExport">导出</el-button>
        </template>
      </el-dialog>

      <!-- Toast -->
      <div v-show="toastMsg" class="alert">
        {{ toastMsg }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import Konva from 'konva';
import { debounce, formatFileSize, frameThrottle, throttle, uid } from '@yunyan-live/utils';
import { YjsProvider } from './whiteboard/YjsProvider';
import { KonvaRenderer } from './whiteboard/KonvaRenderer';
import { uploadPptFile, loadPptMeta, importPptPages, type PptMeta } from './whiteboard/pptImport';
import { runExport, type ExportFormat, type ExportScope } from './whiteboard/exportBoard';
import { regularizePath } from './whiteboard/regularize';
import { computeSnap } from './whiteboard/snap';
import { addRow, removeRow, addCol, removeCol, type TableData } from './whiteboard/table';
import { SYMBOL_GROUPS, insertAtCursor } from './whiteboard/symbols';
import BoardReview from './BoardReview.vue';
import {
  PRESET_COLORS,
  ERASER_WIDTH_MULT,
  HIGHLIGHT_COLOR,
  HIGHLIGHT_WIDTH_MULT,
  type FileItem,
  type ToolMode,
  type PenType,
  type CursorData
} from './whiteboard/types';
import { useUserStore } from '@/store/user';
import Live from '@/api/backstage';

const props = defineProps<{
  roomId: string;
  isTeacher: boolean;
  isDisplay?: boolean;
  opaqueId?: string;
  userName?: string;
  layouts?: number;
}>();

const route = useRoute();
const containerId = ref(`wb-container-${Date.now()}`);
const mode = ref<ToolMode>('cur');
const currentColor = ref('#000000');
const currentSize = ref(1);
const textSize = ref(14);
// F4.3：选中文本的样式态（粗斜/对齐），供工具条高亮与提交
const selBold = ref(false);
const selItalic = ref(false);
const selAlign = ref<'left' | 'center' | 'right'>('left');
// F4.4：当前选中是否表格（属性面板显示增/删行列按钮）
const selIsTable = ref(false);
// F4.3：对齐选项（中文标签，element-plus 无对齐图标）
const alignOptions = [
  { value: 'left' as const, label: '左' },
  { value: 'center' as const, label: '中' },
  { value: 'right' as const, label: '右' }
];
const zoomLevel = ref(100);
const showEditer = ref(false);
const showFillToggle = ref(false);
const fillEnabled = ref(false);
const fillColor = ref('');
const showFillPalette = ref(false);
const showPallet = ref(false);
const showFileList = ref(false);
const showZoomInput = ref(false);
const zoomInputValue = ref(100);
const loading = ref(false);
const toastMsg = ref('');
/** §4.9 F6.2 快照暂存失败横幅：null=正常；数字=服务端重试次数（state 0 恢复时清空） */
const snapshotRetry = ref<number | null>(null);
/** F6.1 板书导出：弹窗/选项/进度；exporting 期间禁用选项与重复提交 */
const exportDialogVisible = ref(false);
const exportScope = ref<ExportScope>('current');
const exportFormat = ref<ExportFormat>('png');
const exporting = ref(false);
const exportProgress = ref<{ done: number; total: number } | null>(null);
const curLayerIndex = ref(1);
const layerIndex = ref(1);
// F5.2：页面缩略图总览浮层（覆盖层；当前页高亮，点击跳页）
const showThumbPanel = ref(false);
function toggleThumbPanel() {
  showThumbPanel.value = !showThumbPanel.value;
}
function jumpToThumb(index: number) {
  showLayer(index + 1);
}
// 缩略图条目：页码 + 是否当前页（快照后续接入离屏渲染，暂用页码占位图）
const thumbPages = computed(() => {
  const ids = renderer?.pageIds ?? [];
  return ids.map((id, i) => ({ id, index: i, current: i === curLayerIndex.value - 1 }));
});
// F6.3 课后回看：教师端入口打开只读快照查看浮层（Q4 MVP 仅教师，服务端 403 鉴权）
const showBoardReview = ref(false);
const fileList = ref<any[]>([]);
const editFileIndex = ref(-1);
const presetColors = PRESET_COLORS;
const endSelectColor = ref(['#000', '#818181', '#B3B3B3', '#fff']);
const palBtnLeft = ref(69);
const palBtnTop = ref(69);
const fpalBtnLeft = ref(69);
const fpalBtnTop = ref(69);
const strokeWheelRef = ref<HTMLCanvasElement>();
const fillWheelRef = ref<HTMLCanvasElement>();
const sizeBtnLeft = ref(0);
const zoomInputRef = ref<HTMLInputElement>();
const currentOpacity = ref(1);
const panelOpacity = ref(1);
/** F4.1 笔型分段控件：pen/highlight（写入 toolState 持久，读侧镜像） */
const penType = ref<PenType>('pen');
/** 笔型档位存根（会话内）：切走时存当前色宽，切回读回——首次进荧光按钢笔 1.5× 预设 */
const penStash = ref<{ color: string; lineWidth: number } | null>(null);
const highlightStash = ref<{ color: string; lineWidth: number } | null>(null);

// --- F1.1 公式输入浮层状态机：默认 → 输入中 →（非法：红框+行内文案）→ 渲染中 → 已提交 ---
const formulaVisible = ref(false);
const formulaInput = ref('');
const formulaError = ref('');
const formulaLoading = ref(false);
/** 双击重编辑时锁定的目标元素 id；null = 新建 */
const editingFormulaId = ref<string | null>(null);
const formulaInputRef = ref<HTMLTextAreaElement>();
/** F1.2 化学模式：开启后提交时裸化学输入自动包裹 \ce{} */
const chemMode = ref(false);
/** F1.3 符号面板：当前分组页签 */
const activeSymbolGroup = ref(SYMBOL_GROUPS[0]!.id);

/** F1.3：在公式光标处插入符号，插入后光标前移并保持聚焦 */
function insertSymbol(sym: string): void {
  const ta = formulaInputRef.value;
  const cursor = ta ? ta.selectionStart : formulaInput.value.length;
  const r = insertAtCursor(formulaInput.value, cursor, sym);
  formulaInput.value = r.value;
  formulaError.value = '';
  if (ta) {
    ta.focus();
    ta.setSelectionRange(r.cursor, r.cursor);
  }
}

// Color panel drag state
const colorPanelCollapsed = ref(true);
const colorPanelX = ref(64);
const colorPanelY = ref(0);
const colorPanelDragOffsetX = ref(0);
const colorPanelDragOffsetY = ref(0);
const isDraggingColor = ref(false);
let colorPanelTimer: number | null = null;

const userId = (route.query.userId as string) || props.opaqueId || uid();
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
  currentElementsObserver = () => {
    elements.unobserveDeep(onElementsChanged);
  };
}
let sizeDragging = false;
let toastTimer: any = null;

function toast(msg: string) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg.value = '';
  }, 2000);
}

onMounted(() => {
  provider = new YjsProvider(
    props.roomId,
    userId,
    displayName,
    userColor,
    kind => {
      useUserStore().sessionInterrupted(kind);
    },
    !props.isTeacher
  );
  // 快照状态帧（服务端仅教师连接推送）：state 1 显示暂存失败横幅，0 恢复后隐藏
  provider.onSnapshotStatus(status => {
    snapshotRetry.value = status.state === 1 ? status.attempt : null;
  });
  renderer = new KonvaRenderer(document.getElementById(containerId.value)!);
  renderer.onShapeClick = selectShape;
  renderer.onShapeDblClick = editTextShape;
  renderer.onShapeDragEnd = commitShapeMove;
  renderer.onShapeTransformEnd = commitShapeTransform;
  renderer.onRefreshRequest = refreshLayer;
  renderer.setSelectMode(mode.value === 'cur' && props.isTeacher);
  renderer.showPage(0);

  const stage = renderer.getStage();
  stage.on('mousedown touchstart', onPointerDown);
  stage.on('mousemove touchmove', onPointerMove);
  stage.on('mouseup touchend', onPointerUp);
  stage.on('wheel', onWheel);

  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onSelectionKeydown);
  provider.awareness.on('change', onAwarenessChange);

  // 计算颜色面板初始位置（选择工具右侧）
  nextTick(() => {
    const toolsEl = document.querySelector('.tools') as HTMLElement;
    if (toolsEl) {
      const rect = toolsEl.getBoundingClientRect();
      colorPanelX.value = rect.right + 10;
      colorPanelY.value = rect.top + 18;
    }
  });

  // 工具态回读：初始读一次（observe 不回放历史，重进房恢复笔型/颜色/粗细），此后随写入同步
  const applyToolState = () => {
    const state = provider!.getToolState();
    currentColor.value = state.color;
    currentSize.value = state.lineWidth;
    textSize.value = state.fontSize;
    currentOpacity.value = state.opacity ?? 1;
    penType.value = state.penType;
  };
  applyToolState();
  provider.toolState.observe(applyToolState);

  // Sync viewport (move pan / zoom / fit-all pan) — register once.
  // 本地写入与远端更新走同一观察器，幂等应用；zoomLevel 同步仅供教师端显示（学生端 UI 隐藏）。
  // 平移（移动工具 + 全览）统一走 x/y 通道，stage 保持恒等——否则选择器缩放坐标系错位
  // F7.5：学生端走冲突判定 + 插值平滑（教师端保持直应用，本地写入幂等）
  provider!.viewportOffset.observe(() => {
    if (props.isTeacher) applyRemoteViewport();
    else applyStudentViewport();
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
      const pageId = yPageIds[i];
      if (pageId !== undefined && !renderer.pageIds.includes(pageId)) {
        renderer.addPage(i, pageId);
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
  // F7.5：教师本地翻页已由 showLayer 即时应用（观察器经相等判断空转）；学生端快速翻页
  // 按 200ms 窗口合并——首帧即刻、窗口内尾帧取最新，避免连续翻页抖动
  provider!.currentPageIndex.observe(() => {
    if (!renderer) return;
    const teacherIdx = provider!.getCurrentPageIndex();
    const localIdx = renderer.getCurrentPageIndex();
    if (teacherIdx === localIdx || teacherIdx >= renderer.getPageCount()) return;
    if (props.isTeacher) {
      applyRemotePage(teacherIdx);
      return;
    }
    const now = Date.now();
    if (now - pageApplyLastAt >= 200) {
      pageApplyLastAt = now;
      pendingPageIndex = null;
      if (pageApplyTimer) {
        clearTimeout(pageApplyTimer);
        pageApplyTimer = null;
      }
      applyRemotePage(teacherIdx);
      return;
    }
    pendingPageIndex = teacherIdx;
    if (!pageApplyTimer) {
      pageApplyTimer = setTimeout(
        () => {
          pageApplyTimer = null;
          if (pendingPageIndex !== null) {
            pageApplyLastAt = Date.now();
            const idx = pendingPageIndex;
            pendingPageIndex = null;
            applyRemotePage(idx);
          }
        },
        200 - (now - pageApplyLastAt)
      );
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
    // 教师端：同步完成即广播取景框（含 stage 尺寸），学生进房即可适配；
    // 学生端：观察器可能晚于初始同步注册，兜底应用一次
    if (props.isTeacher) syncViewportToYjs();
    else applyRemoteViewport();
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
  broadcastViewport.cancel();
  document.removeEventListener('keydown', onSelectionKeydown);
  document.removeEventListener('mousemove', throttledWheelMove);
  document.removeEventListener('mouseup', onWheelUp);
  provider?.awareness.off('change', onAwarenessChange);
  if (cursorLabelTimer) {
    clearTimeout(cursorLabelTimer);
    cursorLabelTimer = null;
  }
  // F7.5：跟随插值 / 翻页节流尾帧 / 冲突横幅计时随卸载清除
  stopViewportAnim();
  if (pageApplyTimer) {
    clearTimeout(pageApplyTimer);
    pageApplyTimer = null;
  }
  if (followBannerTimer) {
    clearTimeout(followBannerTimer);
    followBannerTimer = null;
  }
  renderer?.destroy();
  provider?.destroy();
});

// 视口广播节流：窗口连续缩放时仅按 100ms 节奏同步 Yjs，renderer.resize 仍即时执行
const broadcastViewport = throttle(() => {
  if (!renderer || !provider) return;
  // 教师端：广播新 stage 尺寸（学生端按新比例重适配）；学生端：按最新远端视口重适配
  if (props.isTeacher) syncViewportToYjs();
  else applyRemoteViewport();
}, 100);

function onResize() {
  const el = document.getElementById(containerId.value);
  if (el && renderer) renderer.resize(el.clientWidth, el.clientHeight);
  broadcastViewport();
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
function setMode(type: ToolMode) {
  // 激光模式被任何模式切换顶掉时即熄灭（工具栏/课件/激光按钮自关共用此收口）
  if (mode.value === 'laser' && type !== 'laser') laserOff();
  // 面板互斥矩阵：切工具即收公式浮层（开浮层不切工具，故浮层侧另行收属性/课件面板）
  closeFormula();
  mode.value = type;
  renderer?.setSelectMode(type === 'cur' && props.isTeacher);
  // toolState.type 的唯一写点：工具态同步随模式切换收口（含 laser/file 等旁路）
  provider?.setToolState({ type });
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

// awareness change → 激光单点 + 远端光标渲染（F7.1）。激光坐标即层局部坐标，直接渲染；
// 光标写侧是教师 stage 坐标（任意窗口尺寸），学生端按 contain 比例 k（与 applyRemoteViewport
// 同式）×k 后经 toLayerCoords 换算成层局部坐标 → 与笔迹/激光同空间对齐。
// 两者均用坐标键去重：高频 change 不重复渲染、也不重置光标标签淡出计时
function onAwarenessChange() {
  if (!renderer || !provider) return;
  let laser: { x: number; y: number } | null = null;
  let cursor: CursorData | null = null;
  // for-of 而非 forEach：同作用域赋值可被类型收窄跟踪（闭包内赋值会丢）
  for (const s of provider.awareness.getStates().values()) {
    if (s && s.laser) laser = s.laser;
    // 只渲染远端光标（学生端 provider 只读写不进 cursor，双保险）：跳过本端 userId
    if (s && s.cursor && s.cursor.userId !== userId) cursor = s.cursor;
  }
  const laserKey = laser ? `${laser.x},${laser.y}` : '';
  if (laserKey !== lastLaserKey) {
    lastLaserKey = laserKey;
    renderer.setLaserPoint(laser ? laser.x : null, laser ? laser.y : 0);
  }
  const cursorKey = cursor ? `${cursor.x},${cursor.y}` : '';
  if (cursorKey === lastCursorKey) return;
  lastCursorKey = cursorKey;
  if (!cursor) {
    // peer 离开 / cursor:null → 隐藏光标节点并清尾迹，防幽灵光标残留
    renderer.clearRemoteCursor();
    if (cursorLabelTimer) {
      clearTimeout(cursorLabelTimer);
      cursorLabelTimer = null;
    }
    return;
  }
  const remote = provider.getViewportStageSize();
  const stage = renderer.getStage();
  let k = 1;
  if (remote && remote.w > 0 && remote.h > 0 && stage.width() > 0 && stage.height() > 0) {
    k = Math.min(stage.width() / remote.w, stage.height() / remote.h);
  }
  const lp = toLayerCoords({ x: cursor.x * k, y: cursor.y * k });
  renderer.setRemoteCursor(lp.x, lp.y, cursor.color, cursor.userName);
  // 新光标帧恢复标签并重置 3s 静止淡出计时
  if (cursorLabelTimer) clearTimeout(cursorLabelTimer);
  cursorLabelTimer = setTimeout(() => {
    renderer?.setRemoteCursorLabel(false);
    cursorLabelTimer = null;
  }, 3000);
}

function tool(type: ToolMode) {
  setMode(type);
  showEditer.value = [
    'brush',
    'eraser',
    'text',
    'circle',
    'rectangle',
    'arrows',
    'line',
    'force',
    'leader'
  ].includes(type);
  showFillToggle.value = false;
  showFillPalette.value = false;
  showFileList.value = type === 'file';
}

// F3.1 受力箭头预设标签：素材面板点选武装 → 拖拽绘制恒带该标签（双击可再改）
const FORCE_PRESETS = ['F₁', 'F₂', 'F₃', 'G', 'N', 'f', 'T'] as const;
const armedForceLabel = ref('F₁');
function selectForceLabel(label: string) {
  armedForceLabel.value = label;
  tool('force');
}

// F3.2 引线标注：进入 leader 模式（点击锚点→拖标签位→输入文字）
function selectLeader() {
  tool('leader');
}

function toggleFileList() {
  showFileList.value = !showFileList.value;
  showEditer.value = false;
  setMode(showFileList.value ? 'file' : 'cur');
}

// --- F4.1 笔型切换：分段控件（钢笔/荧光笔），笔型持久工具态 ---
function setPenType(next: PenType) {
  if (next === penType.value) return;
  // 双通道换档：当前档存根 → 目标档读回；首进荧光无存根 → 亮黄 + 钢笔 1.5× 宽预设
  const stash = { color: currentColor.value, lineWidth: currentSize.value };
  if (penType.value === 'pen') penStash.value = stash;
  else highlightStash.value = stash;
  const target = next === 'highlight' ? highlightStash.value : penStash.value;
  const active =
    target ??
    (next === 'highlight'
      ? {
          color: HIGHLIGHT_COLOR,
          lineWidth: Math.max(1, Math.round(stash.lineWidth * HIGHLIGHT_WIDTH_MULT))
        }
      : { color: '#000000', lineWidth: 1 });
  if (next === 'highlight' && !highlightStash.value) highlightStash.value = active;
  if (next === 'pen' && !penStash.value) penStash.value = active;
  penType.value = next;
  provider?.setToolState({ penType: next, color: active.color, lineWidth: active.lineWidth });
  sizeBtnLeft.value = Math.max(0, Math.min(130, ((active.lineWidth - 1) / 19) * 130));
}

function selectPen(next: PenType) {
  setPenType(next);
  tool('brush');
}

// F4.2 手绘图形规整：默认开启，开关置于笔型分段控件的工具子菜单
const regularizeEnabled = ref(true);
function toggleRegularize() {
  regularizeEnabled.value = !regularizeEnabled.value;
}

// F4.5 对齐吸附：拖动与邻元素边缘/中心吸附（Alt 跳过本次）
const snapEnabled = ref(true);
const SNAP_THRESHOLD = 6;
function toggleSnap() {
  snapEnabled.value = !snapEnabled.value;
}

// 抬笔后规整：近似直线/圆/矩形自动变标准图形；Shift 跳过、失败保留原笔迹。
// 变换走独立事务（applyShapeUpdate）→ undo 第一步回手绘、第二步回未绘制（两步语义）
function maybeRegularize(id: string, layerPath: number[], shiftSkip: boolean) {
  if (!provider || shiftSkip || !regularizeEnabled.value || penType.value !== 'pen') return;
  const fit = regularizePath(layerPath);
  if (!fit) return; // 规整失败保留原笔迹
  let target: Record<string, any>;
  let other: Record<string, any> = {};
  if (fit.kind === 'line') {
    target = { type: 'line', points: fit.points, lineCap: 'round', lineJoin: 'round' };
  } else if (fit.kind === 'circle') {
    target = { type: 'circle', x: fit.x, y: fit.y, radius: fit.radius };
    other = { points: true }; // brush 的 points 键须清理（circle 用 x/y/radius）
  } else {
    target = { type: 'rect', x: fit.x, y: fit.y, width: fit.width, height: fit.height };
    other = { points: true };
  }
  applyShapeUpdate(id, target, other);
  morphShapeNode(id); // 100ms morph 过渡（真实 Konva 下生效，测试环境空转）
}

// F4.2：抬笔变换的 100ms 过渡动画——对刚规整的节点做一次缩放回落的 morph
function morphShapeNode(id: string) {
  if (typeof (Konva as any).Tween !== 'function') return; // 测试/mock 环境无 Tween，跳过
  const node = (renderer as any)?.nodeMap?.get?.(id);
  if (!node || typeof node.to !== 'function') return;
  try {
    node.scaleX(0.92);
    node.scaleY(0.92);
    node.to({ scaleX: 1, scaleY: 1, duration: 0.1, easing: (Konva as any).Easings?.easeOut });
  } catch {
    /* morph 非关键路径，失败静默 */
  }
}

// --- 选择器：单选图形，拖动/缩放/删除写回 Yjs ---
// F3.2：按 id 取当前页元素 Y.Map（引线锚点命中对象、commitShapeMove 跟随复用）
function getShape(id: string): any | null {
  const els = provider?.getActiveElements();
  if (!els) return null;
  return els.toArray().find((x: any) => x.get('id') === id) ?? null;
}

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
  const m = provider
    ?.getActiveElements()
    ?.toArray()
    .find(x => x.get('id') === id);
  if (!m) return;
  const type = String(m.get('type'));
  if (type === 'image' || type === 'ppt-image') {
    showEditer.value = false;
    showFillToggle.value = false;
    return;
  }
  colorPanelCollapsed.value = false;
  selIsTable.value = type === 'table';
  if (m.get('color') !== undefined) currentColor.value = String(m.get('color'));
  if (m.get('opacity') !== undefined) currentOpacity.value = Number(m.get('opacity'));
  const isText = type === 'text';
  if (isText && m.get('fontSize') !== undefined) textSize.value = Number(m.get('fontSize'));
  // F4.3：回填选中文本的粗斜/对齐态
  if (isText) {
    selBold.value = !!m.get('bold');
    selItalic.value = !!m.get('italic');
    selAlign.value = (m.get('align') as 'left' | 'center' | 'right') || 'left';
  }
  if (!isText && m.get('lineWidth') !== undefined) currentSize.value = Number(m.get('lineWidth'));
  if (isText && m.get('fontSize') !== undefined) {
    sizeBtnLeft.value = Math.max(0, Math.min(130, ((textSize.value - 8) / 40) * 130));
  } else if (m.get('lineWidth') !== undefined) {
    sizeBtnLeft.value = Math.max(0, Math.min(130, ((currentSize.value - 1) / 19) * 130));
  }
  showFillToggle.value = type === 'rect' || type === 'circle';
  fillEnabled.value = showFillToggle.value && m.get('fill') !== undefined;
  if (m.get('fill') !== undefined) fillColor.value = String(m.get('fill'));
  showFillPalette.value = false;
  showEditer.value = true;
}

function clearSelection() {
  renderer?.clearSelection();
  selIsTable.value = false;
  if (mode.value === 'cur') {
    showEditer.value = false;
    showFillToggle.value = false;
    showFillPalette.value = false;
  }
}

// 双击已有文本：原位弹出编辑框；Enter/失焦提交，Esc 弃改；
// 空内容与未改动视为放弃（避免留下不可见的空文本）
let editingTextId: string | null = null;

function editTextShape(id: string, e?: any) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  if (editingTextId) return;
  const m = provider
    .getActiveElements()
    ?.toArray()
    .find(x => x.get('id') === id);
  if (!m) return;
  const elType = m.get('type');
  // 双击已有公式（F1.1）：预填源码重编辑，提交走 updateElement 同一通道
  if (elType === 'formula') {
    openFormulaFor(id, String(m.get('latex') ?? ''));
    return;
  }
  // F3.1：受力箭头双击改标签——定位标签中点偏移（与 createNode 同款），仅写 label 键
  // F3.1/F3.2：受力箭头/引线标签双击改标签——定位标签点，仅写 label 键（复用同一编辑器）
  if (elType === 'force-arrow' || elType === 'leader-label') {
    const layer = renderer.layer;
    const s = layer.scaleX() || 1;
    const pts = (m.get('points') as number[]) || [];
    // force-arrow 标签在中点上方；leader-label 标签在标签位(pts[2..3])上方
    const baseX =
      elType === 'force-arrow'
        ? (((pts[0] as number) || 0) + ((pts[2] as number) || 0)) / 2 + 6
        : (pts[2] as number) || 0;
    const baseY =
      elType === 'force-arrow'
        ? (((pts[1] as number) || 0) + ((pts[3] as number) || 0)) / 2 - 18
        : ((pts[3] as number) || 0) - 18;
    const screenX = layer.x() + baseX * s;
    const screenY = layer.y() + baseY * s;
    const fontSize = elType === 'force-arrow' ? 16 : Number(m.get('fontSize')) || 14;
    const original = String(m.get('label') ?? '');
    const ta = document.createElement('textarea');
    ta.value = original;
    ta.style.cssText = `position:fixed; left:${screenX}px; top:${screenY}px; font-size:${fontSize}px; color:${String(m.get('color') || '#000')}; border:1px dashed #88b8cc; background:rgba(255,255,255,0.9); outline:none; resize:none; padding:2px 4px; margin:0; overflow:hidden; z-index:999; min-width:32px; min-height:24px; font-family:sans-serif; line-height:1.2;`;
    editingTextId = id;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      editingTextId = null;
      const val = ta.value.trim();
      ta.remove();
      if (!val || val === original) return;
      const before = snapshotShape(id, ['label']);
      if (!before) return;
      if (!applyShapeUpdate(id, { label: val }, before)) return;
      refreshLayer();
    };
    ta.addEventListener('keydown', ke => {
      if (ke.key === 'Enter') {
        ke.preventDefault();
        finish();
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        done = true;
        editingTextId = null;
        ta.remove();
      }
    });
    ta.addEventListener('blur', finish);
    return;
  }
  // F4.4：表格双击编辑单元格——按指针落点算行列，原位 textarea，Enter/失焦提交，Esc 弃改
  if (elType === 'table') {
    const pos = getPointerPos(e);
    if (!pos) return;
    const lp = toLayerCoords(pos);
    const tx = Number(m.get('x')) || 0;
    const ty = Number(m.get('y')) || 0;
    const cellW = Number(m.get('cellW')) || 80;
    const cellH = Number(m.get('cellH')) || 30;
    const rows = Number(m.get('rows')) || 3;
    const cols = Number(m.get('cols')) || 3;
    const col = Math.floor((lp.x - tx) / cellW);
    const row = Math.floor((lp.y - ty) / cellH);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    const cells = (m.get('cells') as Array<Array<{ text: string; bg?: string }>>) || [];
    const original = cells[row]?.[col]?.text ?? '';
    const layer = renderer.layer;
    const s = layer.scaleX() || 1;
    const screenX = layer.x() + (tx + col * cellW) * s;
    const screenY = layer.y() + (ty + row * cellH) * s;
    const fontSize = Number(m.get('fontSize')) || 14;
    const ta = document.createElement('textarea');
    ta.value = original;
    ta.style.cssText = `position:fixed; left:${screenX}px; top:${screenY}px; width:${cellW * s}px; height:${cellH * s}px; box-sizing:border-box; font-size:${fontSize}px; color:#000; border:1px dashed #88b8cc; background:rgba(255,255,255,0.95); outline:none; resize:none; padding:2px 4px; margin:0; overflow:hidden; z-index:999; font-family:sans-serif; line-height:1.2;`;
    editingTextId = id;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      editingTextId = null;
      const val = ta.value.trim();
      ta.remove();
      if (val === original) return;
      const before = snapshotShape(id, ['cells']);
      if (!before) return;
      const nextCells = cells.map(r => r.map(c => ({ ...c })));
      if (nextCells[row] && nextCells[row]![col]) nextCells[row]![col]!.text = val;
      if (!applyShapeUpdate(id, { cells: nextCells }, before)) return;
      refreshLayer();
    };
    ta.addEventListener('keydown', ke => {
      if (ke.key === 'Enter' && !ke.shiftKey) {
        ke.preventDefault();
        finish();
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        done = true;
        editingTextId = null;
        ta.remove();
      }
    });
    ta.addEventListener('blur', finish);
    return;
  }
  if (elType !== 'text') return;

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

// --- F1.1 公式输入浮层（交互写死：∑/双击呼出，Enter 提交、Esc 取消，提交后自动关闭） ---
function openFormula() {
  if (!props.isTeacher || !renderer) return;
  if (formulaVisible.value) return;
  // 面板互斥矩阵：公式浮层/属性面板/素材页签三者互斥单开
  showEditer.value = false;
  showFillToggle.value = false;
  showFillPalette.value = false;
  showFileList.value = false;
  editingFormulaId.value = null;
  formulaInput.value = '';
  formulaError.value = '';
  formulaLoading.value = false;
  formulaVisible.value = true;
  nextTick(() => formulaInputRef.value?.focus());
}

function openFormulaFor(id: string, latex: string) {
  if (!props.isTeacher || formulaVisible.value) return;
  showEditer.value = false;
  showFillToggle.value = false;
  showFillPalette.value = false;
  showFileList.value = false;
  editingFormulaId.value = id;
  formulaInput.value = latex;
  formulaError.value = '';
  formulaLoading.value = false;
  formulaVisible.value = true;
  nextTick(() => {
    formulaInputRef.value?.focus();
    formulaInputRef.value?.select();
  });
}

function closeFormula() {
  formulaVisible.value = false;
  editingFormulaId.value = null;
  formulaInput.value = '';
  formulaError.value = '';
  formulaLoading.value = false;
}

async function submitFormula() {
  if (formulaLoading.value || !formulaVisible.value) return;
  let latex = formulaInput.value.trim();
  if (!latex) {
    formulaError.value = '请输入 LaTeX 公式';
    return;
  }
  formulaLoading.value = true;
  formulaError.value = '';
  try {
    // 懒加载 katex+html2canvas 独立 chunk（§4.9：加载失败 → 可读文案 + 按钮转重试）
    const mod = await import('./whiteboard/formulaRaster');
    // F1.2 化学模式：裸化学输入自动包裹 \ce{}（已在 \ce 或纯数学输入原样）
    if (chemMode.value) latex = mod.wrapChem(latex);
    const check = mod.validateLatex(latex);
    if (!check.ok) {
      formulaError.value = check.message || mod.FORMULA_INVALID_MSG;
      return;
    }
    // 渲染中：量自然尺寸（katex 排版）；位图光栅由节点创建路径带缓存完成
    const box = mod.measureFormula(latex, currentColor.value);
    if (!box || box.width <= 0 || box.height <= 0) {
      formulaError.value = '公式渲染失败，请检查内容后重试';
      return;
    }
    if (editingFormulaId.value) {
      const before = snapshotShape(editingFormulaId.value, ['latex', 'width', 'height']);
      if (
        before &&
        applyShapeUpdate(
          editingFormulaId.value,
          { latex, width: box.width, height: box.height },
          before
        )
      ) {
        refreshLayer();
      }
    } else if (renderer && provider) {
      // 无点击落点 → 视口中心放置（元素存自然尺寸，缩放由 layer 与 width/height 承担）
      const stage = renderer.getStage();
      const lp = toLayerCoords({ x: stage.width() / 2, y: stage.height() / 2 });
      provider.addShape({
        id: uid(),
        type: 'formula',
        latex,
        x: Math.round(lp.x - box.width / 2),
        y: Math.round(lp.y - box.height / 2),
        width: box.width,
        height: box.height,
        color: currentColor.value,
        opacity: currentOpacity.value
      });
      refreshLayer();
    }
    closeFormula();
  } catch (err) {
    console.error('[whiteboard] 公式组件加载失败', err);
    formulaError.value = '公式组件加载失败，点击重试';
  } finally {
    formulaLoading.value = false;
  }
}

// F3.2：收集指向某对象的引线标签（移动被指对象时锚点跟随）
function collectLeadersTargeting(targetId: string): any[] {
  const els = provider?.getActiveElements();
  if (!els) return [];
  return els
    .toArray()
    .filter((m: any) => m.get('type') === 'leader-label' && m.get('targetId') === targetId);
}

function commitShapeMove(id: string, x: number, y: number, altKey?: boolean) {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  // F4.5：对齐吸附——与邻元素边缘/中心对齐，Alt 或开关关闭时跳过
  let tx = x;
  let ty = y;
  if (snapEnabled.value && !altKey) {
    const cur = renderer.getBox(id);
    if (cur) {
      // 吸附盒锚定在提议位置（x,y）+ 元素尺寸：真实拖动与直接调用一致
      const snap = computeSnap(
        { x, y, width: cur.width, height: cur.height },
        renderer.getSnapBoxes(id),
        SNAP_THRESHOLD,
        false
      );
      tx = x + snap.dx;
      ty = y + snap.dy;
      renderer.showGuides(snap.guides);
      // 参考线短暂显示后清除（真实拖动结束即闪现提示）
      setTimeout(() => renderer?.clearGuides(), 400);
    }
  }
  const before = snapshotShape(id, ['x', 'y']);
  if (!before) return;
  before.x = before.x ?? 0;
  before.y = before.y ?? 0;
  if (before.x === tx && before.y === ty) return;
  // F3.2：引线锚点跟随——同事务更新被指对象与所有指向它的引线，撤销/重做原子
  const leaderUpdates = collectLeadersTargeting(id).map(ld => {
    const pts = (ld.get('points') as number[]) || [];
    const rel = ld.get('anchorRel') as [number, number] | null;
    const nx = rel ? tx + rel[0] : (pts[0] as number) || 0;
    const ny = rel ? ty + rel[1] : (pts[1] as number) || 0;
    return {
      id: ld.get('id') as string,
      points: [nx, ny, (pts[2] as number) || 0, (pts[3] as number) || 0]
    };
  });
  let ok = false;
  const p = provider;
  p.doc.transact(() => {
    ok = p.updateElement(id, { x: tx, y: ty });
    if (!ok) return;
    leaderUpdates.forEach(u => p.updateElement(u.id, { points: u.points }));
  });
  if (!ok) {
    // 提交失败（元素已被远端删除等）：立即回滚视觉到 Yjs 实况，且不入 undo 栈
    refreshLayer();
    return;
  }
  refreshLayer();
}

// 写入目标键并清理「对侧」独有的旧形态字段（圆↔椭圆的 radius/radiusX 互斥），
// 提交/撤销/重做三处共用，保持 Yjs 字段规范（createNode 按 radiusX 优先判定椭圆）
function applyShapeUpdate(
  id: string,
  target: Record<string, any>,
  other: Record<string, any>
): boolean {
  if (!provider) return false;
  // 写字段与清残留键必须同事务：D5 下 Y.UndoManager 逐事务成项，
  // 拆开会把「圆形转椭圆」一次提交拆成两档撤销（互斥字段还原不完整）
  const p = provider;
  let ok = false;
  p.doc.transact(() => {
    ok = p.updateElement(id, target);
    if (!ok) return;
    const stale = Object.keys(other).filter(k => !(k in target));
    if (stale.length) p.deleteElementKeys(id, stale);
  });
  return ok;
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
}

// F4.3：选中文本样式提交（粗斜/对齐/行距/宽度）——复用 commitSelectedStyle 通道
function commitTextStyle(patch: Record<string, any>): boolean {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return false;
  const id = renderer.getSelectedId();
  if (!id) return false;
  const keys = Object.keys(patch);
  const before = snapshotShape(id, keys);
  if (!before) return false;
  if (keys.length && keys.every(k => before[k] === patch[k])) return true; // 无变化
  return applyShapeUpdate(id, patch, before) && (refreshLayer(), true);
}

// F4.3：粗斜/对齐切换（选中文本工具条）
function toggleTextStyle(kind: 'bold' | 'italic') {
  const next = kind === 'bold' ? !selBold.value : !selItalic.value;
  if (kind === 'bold') selBold.value = next;
  else selItalic.value = next;
  commitTextStyle({ [kind]: next });
}

function setSelAlign(a: 'left' | 'center' | 'right') {
  selAlign.value = a;
  commitTextStyle({ align: a });
}

// F4.4：表格增/删行列——读当前表格数据 → 不可变变换 → 写回 rows/cols/cells（入 undo 栈）
function tableOp(op: 'addRow' | 'removeRow' | 'addCol' | 'removeCol') {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const id = renderer.getSelectedId();
  if (!id) return;
  const m = getShape(id);
  if (!m || m.get('type') !== 'table') return;
  const data: TableData = {
    rows: (m.get('rows') as number) || 3,
    cols: (m.get('cols') as number) || 3,
    cellW: (m.get('cellW') as number) || 80,
    cellH: (m.get('cellH') as number) || 30,
    cells: (m.get('cells') as TableData['cells']) || []
  };
  let next: TableData;
  if (op === 'addRow') next = addRow(data);
  else if (op === 'removeRow') next = removeRow(data, data.rows - 1);
  else if (op === 'addCol') next = addCol(data);
  else next = removeCol(data, data.cols - 1);
  if (next.rows === data.rows && next.cols === data.cols) return; // 保底无变化
  const before = snapshotShape(id, ['rows', 'cols', 'cells']);
  if (!before) return;
  if (!applyShapeUpdate(id, { rows: next.rows, cols: next.cols, cells: next.cells }, before))
    return;
  refreshLayer();
}

// 粗细条当前作用对象：绘制文本模式，或选中的是文本图形 → 字号；否则线宽
function sizeTargetsText(): boolean {
  if (mode.value === 'text') return true;
  if (mode.value !== 'cur') return false;
  const id = renderer?.getSelectedId();
  if (!id) return false;
  return (
    provider
      ?.getActiveElements()
      ?.toArray()
      .find(x => x.get('id') === id)
      ?.get('type') === 'text'
  );
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
}

function deleteSelected() {
  if (!props.isTeacher || mode.value !== 'cur' || !provider || !renderer) return;
  const id = renderer.getSelectedId();
  if (!id) return;
  const els = provider.getActiveElements();
  const m = els?.toArray().find((x: any) => x.get('id') === id);
  if (!m) return;
  const shapeData: Record<string, any> = {};
  m.forEach((v: any, k: string) => {
    shapeData[k] = v;
  });
  const index = provider.removeElement(id);
  if (index < 0) return;
  clearSelection();
  refreshLayer();
}

// --- Drawing state ---
let isDrawing = false;
let startPos: { x: number; y: number } | null = null;
let currentPath: number[] = [];
// F3.2 引线标注：拖拽期间记录被指对象与其相对锚点偏移（mouseup 落库 targetId/anchorRel）
let leaderTargetId: string | null = null;
let leaderAnchorRel: [number, number] | null = null;
// 激光广播节流（50ms）与远端状态去重（同坐标不重复渲染）
let lastLaserSend = 0;
let lastLaserKey = '';
// 教师光标 awareness 写侧节流（50ms，对齐 laser）与远端状态去重（同坐标不重复渲染/不重置淡出计时）
let lastCursorSend = 0;
let lastCursorKey = '';
// 静止 3s 标签淡出计时（F7.1；每次远端光标帧到达即重置）
let cursorLabelTimer: ReturnType<typeof setTimeout> | null = null;

function onSelectionKeydown(e: KeyboardEvent) {
  const ae = document.activeElement;
  if (
    ae &&
    (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)
  )
    return;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  // F4.6：Ctrl+Shift+X 截图框选（startScreenshot 自带学生端守卫）
  if (mod && e.shiftKey && key === 'x') {
    e.preventDefault();
    void startScreenshot();
    return;
  }
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
    // F4.6：截图框选中 Esc = 取消框选（先于选中清理，不透传）
    if (screenshotVisible.value) {
      resetScreenshot();
      return;
    }
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

// --- F4.1 橡皮：按元素整笔擦除（折线类命中即删，非像素级、不落库白盖） ---
function erasePreview(lp: { x: number; y: number }) {
  if (!renderer) return;
  const radius = (currentSize.value * ERASER_WIDTH_MULT) / 2;
  renderer.previewLayer.destroyChildren();
  renderer.previewLayer.add(
    new Konva.Circle({
      x: lp.x,
      y: lp.y,
      radius,
      stroke: '#8b8b93',
      strokeWidth: 1,
      listening: false
    })
  );
  renderer.previewLayer.batchDraw();
}

function eraseAt(pos: { x: number; y: number }) {
  if (!provider || !renderer) return;
  const lp = toLayerCoords(pos);
  erasePreview(lp);
  const radius = (currentSize.value * ERASER_WIDTH_MULT) / 2;
  let hits = 0;
  for (;;) {
    const id = renderer.hitStroke(lp.x, lp.y, radius);
    if (!id || ++hits > 500) break;
    provider.removeElement(id);
    refreshLayer();
  }
}

function onPointerDown(e: any) {
  // 学生端白板只读：不响应任何绘制/交互
  if (!props.isTeacher) return;
  const pos = getPointerPos(e);
  if (!pos) return;
  const m = mode.value;

  if (m === 'brush') {
    isDrawing = true;
    currentPath = [pos.x, pos.y];
  } else if (m === 'eraser') {
    isDrawing = true;
    eraseAt(pos);
  } else if (['circle', 'rectangle', 'arrows', 'line', 'force', 'leader'].includes(m)) {
    isDrawing = true;
    startPos = pos;
    // F3.2：引线锚点命中被指对象（bounding-box），记录相对偏移供移动跟随
    if (m === 'leader') {
      const lp = toLayerCoords(pos);
      leaderTargetId = renderer?.hitElementAt(lp.x, lp.y) ?? null;
      const t = leaderTargetId ? getShape(leaderTargetId) : null;
      leaderAnchorRel = t
        ? [lp.x - (Number(t.get('x')) || 0), lp.y - (Number(t.get('y')) || 0)]
        : null;
    }
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
            id: uid(),
            type: 'text',
            x: layerPos.x,
            y: layerPos.y,
            text: val,
            fontSize: textSize.value,
            color: currentColor.value,
            opacity: currentOpacity.value
          };
          provider?.addShape(shapeData);
          refreshLayer();
        }
        textarea.remove();
      };
      textarea.addEventListener('blur', commitText);
      textarea.addEventListener('keydown', ke => {
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          textarea.blur();
        }
        if (ke.key === 'Escape') {
          textarea.value = '';
          textarea.blur();
        }
      });
    }, 0);
  } else if (m === 'table') {
    // F4.4：点击落点插入固定 3×3 模板表格（非拖框）
    const layerPos = toLayerCoords(pos);
    provider?.addShape({
      id: uid(),
      type: 'table',
      x: layerPos.x,
      y: layerPos.y,
      rows: 3,
      cols: 3,
      cellW: 80,
      cellH: 30,
      color: currentColor.value,
      fontSize: textSize.value,
      opacity: currentOpacity.value,
      cells: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ text: '' })))
    });
    refreshLayer();
    tool('cur');
  } else if (m === 'move') {
    isDrawing = true;
    startPos = pos;
  } else if (m === 'cur') {
    // 点击空白处取消选中（点中图形由节点 click 处理器选中）
    const target = e.target;
    if (
      !target ||
      target === renderer?.getStage() ||
      target === renderer?.layer ||
      target === renderer?.previewLayer ||
      target === renderer?.tempLayer
    ) {
      clearSelection();
    }
  }
}

function onPointerMove(e: any) {
  const pos = getPointerPos(e);
  if (!pos) return;
  // F7.1 光标广播：悬停即发（50ms 节流，与 laser 对齐；学生端由 provider.readOnly 拦截）。
  // 置于激光/绘制分支之前：激光模式下教师指针同时广播红点与光标（DoD 两者共存）
  const cursorNow = Date.now();
  if (cursorNow - lastCursorSend >= 50) {
    lastCursorSend = cursorNow;
    provider?.updateCursor({ userId, userName: displayName, x: pos.x, y: pos.y, color: userColor });
  }
  // 激光笔：不依赖 isDrawing，红点跟指 + 节流广播（学生端仅接收渲染，进不到此分支）
  if (mode.value === 'laser') {
    const lp = toLayerCoords(pos);
    renderer?.setLaserPoint(lp.x, lp.y);
    const now = Date.now();
    if (now - lastLaserSend >= 50) {
      lastLaserSend = now;
      provider?.setLaser(lp.x, lp.y);
    }
    return;
  }
  if (!isDrawing) return;
  const m = mode.value;

  if (m === 'brush') {
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
      stroke: currentColor.value,
      strokeWidth: currentSize.value,
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.5,
      ...(penType.value === 'highlight' ? { globalCompositeOperation: 'multiply' } : {})
    });
    renderer!.previewLayer.add(line);
    renderer!.previewLayer.batchDraw();
  } else if (m === 'eraser') {
    eraseAt(pos);
  } else if (['circle', 'rectangle', 'arrows', 'line', 'force', 'leader'].includes(m) && startPos) {
    renderer!.previewLayer.destroyChildren();
    drawTempShape(pos, !!e?.evt?.shiftKey);
    renderer!.previewLayer.batchDraw();
  } else if (m === 'move' && startPos) {
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    const newX = renderer!.layer.x() + dx;
    const newY = renderer!.layer.y() + dy;
    renderer!.setViewport(newX, newY);
    syncViewportToYjs();
    startPos = pos;
  }
}

function onPointerUp(e: any) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getPointerPos(e);
  // 只清预览层：tempLayer 上的选中框/手柄（transformer）不能被绘制清理连带销毁
  renderer!.previewLayer.destroyChildren();
  renderer!.previewLayer.batchDraw();
  const m = mode.value;

  // 同步尚未完成时 pages 可能未播种，否则 addShape 静默丢弃；与图片添加一致先兜底建页
  if (
    provider &&
    !provider.getActiveElements() &&
    ['brush', 'circle', 'rectangle', 'arrows', 'line', 'force', 'leader'].includes(m)
  ) {
    provider.addPage();
  }

  if (m === 'brush' && currentPath.length > 2) {
    const layerPath: number[] = [];
    for (let i = 0; i < currentPath.length; i += 2) {
      const lp = toLayerCoords({ x: currentPath[i]!, y: currentPath[i + 1]! });
      layerPath.push(lp.x, lp.y);
    }
    const shapeData: Record<string, any> = {
      id: uid(),
      type: m,
      points: layerPath,
      color: currentColor.value,
      lineWidth: currentSize.value,
      opacity: currentOpacity.value,
      // F4.1 荧光笔迹：blend=multiply 随元素落库（钢笔不写该键，键集差语义不受污染）
      ...(penType.value === 'highlight' ? { blend: 'multiply' } : {})
    };
    provider?.addShape(shapeData);
    currentPath = [];
    // F4.2：抬笔规整（Shift 跳过/失败保留）——变换独立事务，undo 两步
    maybeRegularize(shapeData.id, layerPath, !!e?.evt?.shiftKey);
    refreshLayer();
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
        id: uid(),
        type: 'circle',
        x: layerStart.x,
        y: layerStart.y,
        color: currentColor.value,
        lineWidth: currentSize.value,
        opacity: currentOpacity.value,
        ...(fillEnabled.value ? { fill: fillColor.value || currentColor.value } : {}),
        ...(shift ? { radius } : { radiusX: rx, radiusY: ry })
      };
      provider?.addShape(shapeData);
      refreshLayer();
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
        id: uid(),
        type: 'line',
        points: [layerStart.x, layerStart.y, layerStart.x + dx, layerStart.y + dy],
        color: currentColor.value,
        lineWidth: currentSize.value,
        opacity: currentOpacity.value
      };
      provider?.addShape(shapeData);
      refreshLayer();
    }
  } else if (m === 'rectangle' && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    const w = Math.abs(layerEnd.x - layerStart.x);
    const h = Math.abs(layerEnd.y - layerStart.y);
    if (w > 2 && h > 2) {
      const shapeData: Record<string, any> = {
        id: uid(),
        type: 'rect',
        x: Math.min(layerStart.x, layerEnd.x),
        y: Math.min(layerStart.y, layerEnd.y),
        width: w,
        height: h,
        color: currentColor.value,
        lineWidth: currentSize.value,
        opacity: currentOpacity.value,
        ...(fillEnabled.value ? { fill: fillColor.value || currentColor.value } : {})
      };
      provider?.addShape(shapeData);
      refreshLayer();
    }
  } else if ((m === 'arrows' || m === 'force') && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    let dx = layerEnd.x - layerStart.x;
    let dy = layerEnd.y - layerStart.y;
    const shift = !!e?.evt?.shiftKey;
    // Shift 锁定水平/垂直（按主方向取舍，与直线一致，F5.1 回归修复 P1）
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      const shapeData: Record<string, any> = {
        id: uid(),
        type: m === 'force' ? 'force-arrow' : 'arrow',
        points: [layerStart.x, layerStart.y, layerStart.x + dx, layerStart.y + dy],
        color: currentColor.value,
        lineWidth: currentSize.value,
        opacity: currentOpacity.value,
        // F3.1：受力箭头恒带标签（预设武装），普通箭头无此键
        ...(m === 'force' ? { label: armedForceLabel.value } : {})
      };
      provider?.addShape(shapeData);
      refreshLayer();
    }
  } else if (m === 'leader' && startPos && pos) {
    const layerStart = toLayerCoords(startPos);
    const layerEnd = toLayerCoords(pos);
    if (Math.hypot(layerEnd.x - layerStart.x, layerEnd.y - layerStart.y) > 5) {
      provider?.addShape({
        id: uid(),
        type: 'leader-label',
        points: [layerStart.x, layerStart.y, layerEnd.x, layerEnd.y],
        label: '',
        targetId: leaderTargetId,
        anchorRel: leaderAnchorRel,
        color: currentColor.value,
        lineWidth: currentSize.value,
        fontSize: textSize.value,
        opacity: currentOpacity.value
      });
      refreshLayer();
    }
  }
  startPos = null;
  leaderTargetId = null;
  leaderAnchorRel = null;
}

function drawTempShape(pos: { x: number; y: number }, shift: boolean) {
  if (!startPos || !renderer) return;
  const m = mode.value;
  // 预览节点存层局部坐标（previewLayer 与 layer 同变换），与最终落盘完全一致
  const ls = toLayerCoords(startPos);
  const le = toLayerCoords(pos);

  if (m === 'rectangle') {
    renderer.previewLayer.add(
      new Konva.Rect({
        x: Math.min(ls.x, le.x),
        y: Math.min(ls.y, le.y),
        width: Math.abs(le.x - ls.x),
        height: Math.abs(le.y - ls.y),
        stroke: currentColor.value,
        strokeWidth: currentSize.value,
        fill: fillEnabled.value ? fillColor.value || currentColor.value : undefined
      })
    );
  } else if (m === 'circle') {
    const dx = le.x - ls.x;
    const dy = le.y - ls.y;
    const fill = fillEnabled.value ? fillColor.value || currentColor.value : undefined;
    if (shift) {
      // Shift 约束为正圆（取较大值），与 Konva Transformer 的 Shift 行为一致
      renderer.previewLayer.add(
        new Konva.Circle({
          x: ls.x,
          y: ls.y,
          radius: Math.max(Math.abs(dx), Math.abs(dy)),
          stroke: currentColor.value,
          strokeWidth: currentSize.value,
          fill
        })
      );
    } else {
      renderer.previewLayer.add(
        new Konva.Ellipse({
          x: ls.x,
          y: ls.y,
          radiusX: Math.abs(dx),
          radiusY: Math.abs(dy),
          stroke: currentColor.value,
          strokeWidth: currentSize.value,
          fill
        })
      );
    }
  } else if (m === 'line') {
    let dx = le.x - ls.x;
    let dy = le.y - ls.y;
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    renderer.previewLayer.add(
      new Konva.Line({
        points: [ls.x, ls.y, ls.x + dx, ls.y + dy],
        stroke: currentColor.value,
        strokeWidth: currentSize.value,
        lineCap: 'round',
        lineJoin: 'round'
      })
    );
  } else if (m === 'arrows' || m === 'force') {
    let dx = le.x - ls.x;
    let dy = le.y - ls.y;
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    renderer.previewLayer.add(
      new Konva.Arrow({
        points: [ls.x, ls.y, ls.x + dx, ls.y + dy],
        stroke: currentColor.value,
        strokeWidth: currentSize.value,
        fill: currentColor.value
      })
    );
    // F3.1：受力箭头预览同步展示标签（与落盘节点同款中点偏移）
    if (m === 'force') {
      renderer.previewLayer.add(
        new Konva.Text({
          x: (ls.x + ls.x + dx) / 2 + 6,
          y: (ls.y + ls.y + dy) / 2 - 18,
          text: armedForceLabel.value,
          fontSize: 16,
          fill: currentColor.value
        })
      );
    }
  } else if (m === 'leader') {
    renderer.previewLayer.add(
      new Konva.Line({
        points: [ls.x, ls.y, le.x, le.y],
        stroke: currentColor.value,
        strokeWidth: currentSize.value,
        lineCap: 'round'
      })
    );
  }
}

function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
  if (!props.isTeacher) {
    // F7.5：学生端本地只读缩放（不写 Yjs），进入手动模式——与教师视口冲突时教师优先
    e.evt.preventDefault();
    if (!renderer) return;
    stopViewportAnim(); // 手动缩放打断进行中的跟随插值
    studentManual = true;
    const delta = e.evt.deltaY > 0 ? -10 : 10;
    zoomLevel.value = delta > 0 ? renderer.zoomIn() : renderer.zoomOut();
    return;
  }
  e.evt.preventDefault();
  const delta = e.evt.deltaY > 0 ? -10 : 10;
  layerZoomChange(delta > 0 ? 'add' : 'sub');
}

function refreshLayer() {
  const elements = provider?.getActiveElements();
  if (elements && renderer) renderer.bindElements(elements);
}

// --- Undo/Redo ---
// D5：撤销/重做由 Y.UndoManager（provider.undoManager）接管——板书事务自动入栈
// （captureTransaction 白名单：pages 及各页 elements），此处只负责 toast 与跳页
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
  if (!renderer || !provider) return;
  if (type === 'pre') {
    const item = provider.undo();
    if (!item) {
      toast('没有更多撤销');
      return;
    }
    jumpToUndoMeta(item);
  } else {
    const item = provider.redo();
    if (!item) {
      toast('没有更多重做');
      return;
    }
    jumpToUndoMeta(item);
  }
}

// 撤销/重做后按栈项 meta 跳回操作发生页（meta 由 provider 在 stack-item-added 记录）；
// 跨页删除后页数已变，按当前页数夹取
function jumpToUndoMeta(item: { meta: Map<unknown, unknown> }) {
  const idx = item.meta.get('pageIndex');
  if (typeof idx === 'number') {
    ensurePageIndex(Math.min(idx, Math.max(0, renderer!.getPageCount() - 1)));
  }
  refreshLayer();
}

function layerClear() {
  // 学生端守卫：直接操作 Yjs elements，绕过 provider，必须在此拦截
  if (!props.isTeacher) return;
  renderer?.clearCurrentPage();
  const activeEls = provider?.getActiveElements();
  if (activeEls) activeEls.delete(0, activeEls.length);
  // 与旧栈一致：清空画布后无撤销/重做可言
  provider?.clearUndoStack();
}

// --- Zoom ---
// F7.5 学生端跟随状态：手动缩放模式 / 冲突横幅 / 跟随插值与翻页节流定时器
let studentManual = false;
const followBanner = ref(false);
let followBannerTimer: ReturnType<typeof setTimeout> | null = null;
let viewportAnimTimer: ReturnType<typeof setTimeout> | null = null;
let pageApplyTimer: ReturnType<typeof setTimeout> | null = null;
let pageApplyLastAt = -Infinity;
let pendingPageIndex: number | null = null;

// 按视口数据计算本地目标视图：远端带 stage 尺寸时按 contain 比例适配（教师取景框等比套入本地屏幕，
// 宽高比不同处留白），否则原样应用。zoom 钳制与 renderer.setZoom 一致（1~200），供插值目标与冲突比对
function computeRemoteView(): { x: number; y: number; zoom: number } {
  const o = provider!.getViewportOffset();
  const zoom = provider!.getViewportZoom();
  const remote = provider!.getViewportStageSize();
  const stage = renderer!.getStage();
  const sw = stage.width();
  const sh = stage.height();
  let k = 1;
  if (remote && remote.w > 0 && remote.h > 0 && sw > 0 && sh > 0) {
    k = Math.min(sw / remote.w, sh / remote.h);
  }
  return { x: o.x * k, y: o.y * k, zoom: Math.max(1, Math.min(200, zoom * k)) };
}

// 直应用目标视图：教师端观察器 / 学生端本地 resize 重适配 / 插值终帧共用
function applyView(v: { x: number; y: number; zoom: number }) {
  renderer!.setViewport(v.x, v.y);
  renderer!.setZoom(v.zoom);
  zoomLevel.value = v.zoom;
}

function applyRemoteViewport() {
  if (!renderer || !provider) return;
  const t = computeRemoteView();
  if (!props.isTeacher && studentManual) {
    // 学生手动模式下的本地 resize 重适配：保留学生本地缩放，只跟随教师平移
    renderer.setViewport(t.x, t.y);
    return;
  }
  applyView(t);
}

// F7.5：学生端视口观察器入口——手动冲突判定 + 250ms ease-out 插值（大跳变直切）
function applyStudentViewport() {
  if (!renderer || !provider) return;
  const t = computeRemoteView();
  if (studentManual) {
    studentManual = false;
    const diverged =
      Math.abs(renderer.layer.x() - t.x) > 1e-6 ||
      Math.abs(renderer.layer.y() - t.y) > 1e-6 ||
      Math.abs(renderer.getZoom() - t.zoom) > 1e-6;
    // 教师视口优先；学生视图与目标一致（未分歧）则静默，不误报横幅
    if (diverged) showFollowBanner();
  }
  interpolateViewport(t);
}

// 视口切换插值：250ms ease-out 逐帧应用；弱网堆积的大跳变（平移 ≥2000px 或缩放 ≥2×）
// 直接切换，避免长时间滑行
function interpolateViewport(target: { x: number; y: number; zoom: number }) {
  if (!renderer) return;
  stopViewportAnim();
  const from = { x: renderer.layer.x(), y: renderer.layer.y(), zoom: renderer.getZoom() };
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dz = target.zoom - from.zoom;
  const ratio = target.zoom / Math.max(from.zoom, 1e-6);
  if (Math.hypot(dx, dy) >= 2000 || ratio >= 2 || ratio <= 0.5) {
    applyView(target);
    return;
  }
  if (dx === 0 && dy === 0 && dz === 0) return;
  const start = Date.now();
  const step = () => {
    viewportAnimTimer = null;
    const p = Math.min(1, (Date.now() - start) / 250);
    if (p >= 1) {
      applyView(target); // 终帧取精确目标，避免浮点累积误差
      return;
    }
    const e = 1 - Math.pow(1 - p, 3); // ease-out
    applyView({ x: from.x + dx * e, y: from.y + dy * e, zoom: from.zoom + dz * e });
    viewportAnimTimer = setTimeout(step, 16);
  };
  viewportAnimTimer = setTimeout(step, 16);
}

function stopViewportAnim() {
  if (viewportAnimTimer) {
    clearTimeout(viewportAnimTimer);
    viewportAnimTimer = null;
  }
}

// F7.5：冲突横幅——教师视口覆盖学生手动视图时提示，5s 自动消失
function showFollowBanner() {
  followBanner.value = true;
  if (followBannerTimer) clearTimeout(followBannerTimer);
  followBannerTimer = setTimeout(() => {
    followBanner.value = false;
    followBannerTimer = null;
  }, 5000);
}

function onFollowBannerClick() {
  if (followBannerTimer) {
    clearTimeout(followBannerTimer);
    followBannerTimer = null;
  }
  followBanner.value = false;
  studentManual = true; // 恢复手动模式
}

// F7.5：远端翻页单次应用（教师直调 / 学生节流尾帧共用；相等与越界守卫幂等）
function applyRemotePage(teacherIdx: number) {
  if (!renderer || !provider) return;
  if (teacherIdx === renderer.getCurrentPageIndex() || teacherIdx >= renderer.getPageCount())
    return;
  renderer.showPage(teacherIdx);
  curLayerIndex.value = teacherIdx + 1;
  refreshLayer();
  const els = provider.getActiveElements();
  if (els) bindElementsObserver(els);
}

// 把教师端当前视口（缩放 + 平移，移动工具与全览共用 x/y 通道 + stage 尺寸）写入 Yjs，学生端观察器跟随适配
// 必须先本地捕获再一次性原子写：若先写 zoom，观察器会用地图旧 x/y 回写本地视口，之后 getView 读到的已是旧值
function syncViewportToYjs() {
  if (!renderer || !provider) return;
  const view = renderer.getView();
  const zoom = renderer.getZoom();
  const stage = renderer.getStage();
  provider.setViewportAll({ x: view.x, y: view.y, zoom, sw: stage.width(), sh: stage.height() });
}

function layerZoomChange(type: string) {
  if (!renderer) return;
  if (type === 'sub') zoomLevel.value = renderer.zoomOut();
  else if (type === 'add') zoomLevel.value = renderer.zoomIn();
  else if (type === 'all') {
    renderer.zoomFitAll();
    zoomLevel.value = renderer.getZoom();
  }
  syncViewportToYjs();
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
}

// --- Pages ---
function addLayer() {
  provider?.addPage();
}

function showLayer(index: number) {
  if (!renderer) return;
  const max = renderer.getPageCount();
  index = Math.max(1, Math.min(max, index));
  renderer.showPage(index - 1);
  curLayerIndex.value = index;
  provider?.setCurrentPageIndex(index - 1);
  refreshLayer();
  // 与旧栈一致：手动翻页清空重做栈（只清 redo，不清 undo）
  provider?.undoManager.clear(false, true);
  const newElements = provider?.getActiveElements();
  if (newElements) bindElementsObserver(newElements);
  zoomLevel.value = renderer.getZoom();
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
    return;
  }
  if (renderer.getPageCount() <= 1) {
    layerClear();
    return;
  }
  provider?.removePage(index - 1);
  toast('已删除画布');
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

// --- 颜色轮盘：HSV 逐像素绘制（色相绕环 / 饱和度径向 / 中心泛白），绘制与取色读同一块画布，所见即所得 ---
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function drawWheel(canvas?: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const half = size / 2;
  const maxR2 = half * half;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - half + 0.5;
      const dy = y - half + 0.5;
      const dist2 = dx * dx + dy * dy;
      const idx = (y * size + x) * 4;
      if (dist2 > maxR2) {
        data[idx + 3] = 0;
        continue;
      }
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const sat = Math.min(1, Math.sqrt(dist2) / half);
      const [r, g, b] = hsvToRgb(hue, sat, 1);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function sampleWheelAt(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || canvas.width;
  const cssH = rect.height || canvas.height;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const dx = x - cssW / 2;
  const dy = y - cssH / 2;
  if (Math.sqrt(dx * dx + dy * dy) > Math.min(cssW, cssH) / 2) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pixel = ctx.getImageData(
    Math.round(x * (canvas.width / cssW)),
    Math.round(y * (canvas.height / cssH)),
    1,
    1
  ).data;
  const hex =
    '#' + [pixel[0], pixel[1], pixel[2]].map(v => v!.toString(16).padStart(2, '0')).join('');
  const size = Math.min(cssW, cssH);
  return {
    hex,
    left: Math.max(0, Math.min(size - 12, x - 6)),
    top: Math.max(0, Math.min(size - 12, y - 6))
  };
}

let wheelDragging = false;
let wheelDragKind: 'stroke' | 'fill' = 'stroke';
let wheelHex: string | null = null;

function wheelSample(kind: 'stroke' | 'fill', clientX: number, clientY: number): string | null {
  const canvas = kind === 'stroke' ? strokeWheelRef.value : fillWheelRef.value;
  if (!canvas) return null;
  const hit = sampleWheelAt(canvas, clientX, clientY);
  if (!hit) return null;
  if (kind === 'stroke') {
    palBtnLeft.value = hit.left;
    palBtnTop.value = hit.top;
    currentColor.value = hit.hex;
  } else {
    fpalBtnLeft.value = hit.left;
    fpalBtnTop.value = hit.top;
    fillEnabled.value = true;
    fillColor.value = hit.hex;
  }
  return hit.hex;
}

function onWheelMove(e: MouseEvent) {
  if (!wheelDragging) return;
  const hex = wheelSample(wheelDragKind, e.clientX, e.clientY);
  if (hex) wheelHex = hex;
}

// 色轮取样节流：30ms 窗口内合并高频采样（首次同步触发，保证按压即时预览）
const throttledWheelMove = throttle(onWheelMove, 30);

function onWheelUp() {
  if (!wheelDragging) return;
  wheelDragging = false;
  throttledWheelMove.cancel();
  document.removeEventListener('mousemove', throttledWheelMove);
  document.removeEventListener('mouseup', onWheelUp);
  const hex = wheelHex;
  wheelHex = null;
  if (!hex) return;
  if (wheelDragKind === 'stroke') selectColor(hex);
  else pickFillColor(hex, true);
}

// 按下即预览、拖动连续采样、松手一次性提交——预览只改本地值，避免拖动过程刷 undo 栈
function startWheelPick(e: MouseEvent, kind: 'stroke' | 'fill') {
  if (kind === 'fill' && (!props.isTeacher || mode.value !== 'cur')) return;
  if (wheelDragging) return;
  e.preventDefault();
  wheelDragKind = kind;
  wheelDragging = true;
  wheelHex = wheelSample(kind, e.clientX, e.clientY);
  document.addEventListener('mousemove', throttledWheelMove);
  document.addEventListener('mouseup', onWheelUp);
}

watch(showPallet, open => {
  if (open) nextTick(() => drawWheel(strokeWheelRef.value));
});
watch(showFillPalette, open => {
  if (open) nextTick(() => drawWheel(fillWheelRef.value));
});

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

// --- Fill (仅矩形/圆形)：点「填充」弹出色板——选色写入 fill / 无颜色删除字段；
// 填充色与描边色完全独立（换描边不动 fill，改填充不动 color）---
function toggleFillPalette() {
  if (!props.isTeacher || mode.value !== 'cur') return;
  showFillPalette.value = !showFillPalette.value;
}
function pickFillColor(color: string, keepOpen = false) {
  if (!props.isTeacher || mode.value !== 'cur') return;
  fillEnabled.value = true;
  fillColor.value = color;
  if (!keepOpen) showFillPalette.value = false;
  commitSelectedStyle({ fill: color });
}
function clearFillColor() {
  if (!props.isTeacher || mode.value !== 'cur') return;
  fillEnabled.value = false;
  showFillPalette.value = false;
  commitSelectedStyle({}, ['fill']);
}

// Color panel drag
function onColorPanelDragStart(e: MouseEvent) {
  isDraggingColor.value = true;
  colorPanelDragOffsetX.value = e.clientX - colorPanelX.value;
  colorPanelDragOffsetY.value = e.clientY - colorPanelY.value;
  document.addEventListener('mousemove', throttledColorPanelDragMove);
  document.addEventListener('mouseup', onColorPanelDragEnd);
}
function onColorPanelDragMove(e: MouseEvent) {
  colorPanelX.value = e.clientX - colorPanelDragOffsetX.value;
  colorPanelY.value = e.clientY - colorPanelDragOffsetY.value;
}
const throttledColorPanelDragMove = frameThrottle(onColorPanelDragMove);
function onColorPanelDragEnd() {
  isDraggingColor.value = false;
  throttledColorPanelDragMove.flush();
  document.removeEventListener('mousemove', throttledColorPanelDragMove);
  document.removeEventListener('mouseup', onColorPanelDragEnd);
}
function openColorPanel() {
  if (colorPanelTimer) {
    clearTimeout(colorPanelTimer);
    colorPanelTimer = null;
  }
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
  if (colorPanelTimer) {
    clearTimeout(colorPanelTimer);
    colorPanelTimer = null;
  }
}
// 透明度广播防抖：滑杆拖动期间本地预览即时，工具状态在 80ms 静默后才同步 Yjs
const broadcastOpacity = debounce((opacity: number) => {
  provider?.setToolState({ opacity });
}, 80);

function onOpacityInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  currentOpacity.value = val;
  broadcastOpacity(val);
}
// 松手（change）才写回所选图形，拖动过程仅本地预览；提交前补发最后一次工具状态
function onOpacityChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  broadcastOpacity.flush();
  commitSelectedStyle({ opacity: val });
}
function onPanelOpacityInput(e: Event) {
  panelOpacity.value = parseFloat((e.target as HTMLInputElement).value);
}
// 笔尖大小广播节流：拖动期间本地尺寸即时更新，Yjs 工具状态按 50ms 节奏同步（对齐激光笔）
const broadcastSizeState = throttle((state: { fontSize?: number; lineWidth?: number }) => {
  provider?.setToolState(state);
}, 50);

function updateSizeFromMouse(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = Math.max(0, Math.min(130, e.clientX - rect.left));
  sizeBtnLeft.value = x;
  const size = sizeTargetsText() ? Math.round(8 + (x / 130) * 40) : Math.round(1 + (x / 130) * 19);
  if (sizeTargetsText()) {
    textSize.value = size;
    broadcastSizeState({ fontSize: size });
  } else {
    currentSize.value = size;
    broadcastSizeState({ lineWidth: size });
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

// pos：F4.6 截图按框选原位落点；缺省（文件上传）保持页面左上默认位
async function uploadImage(file: File, pos?: { x: number; y: number }) {
  if (!uploadImageApi) {
    toast('未配置图片上传接口');
    return;
  }
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
        id: uid(),
        type: 'image',
        url: fileUrl,
        x: pos?.x ?? 50,
        y: pos?.y ?? 50,
        width: w,
        height: h,
        opacity: currentOpacity.value
      };
      // 同步尚未完成时 pages 可能未播种，getActiveElements() 为 null 会让 addShape 静默丢弃；先兜底建页
      if (!provider?.getActiveElements()) {
        provider?.addPage();
      }
      provider?.addShape(shapeData);
      refreshLayer();
      toast('图片已添加');
    } else {
      toast('上传失败');
    }
  } catch (e) {
    toast(`上传出错: ${(e as Error).message}`);
  }
  loading.value = false;
}

// --- F4.6 截图插入 ---
// 框选遮罩状态：visible=遮罩在显；img=屏幕捕获 dataURL；sel=框选矩形（容器显示坐标）
const screenshotVisible = ref(false);
const screenshotImg = ref('');
const shotSel = ref<{ x: number; y: number; w: number; h: number } | null>(null);
let shotStart: { x: number; y: number } | null = null;

const shotSelStyle = computed(() => {
  const s = shotSel.value;
  return s
    ? { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` }
    : undefined;
});

function resetScreenshot() {
  screenshotVisible.value = false;
  screenshotImg.value = '';
  shotSel.value = null;
  shotStart = null;
}

// dataURL → Blob：F4.6 裁剪结果 / 剪贴板降级统一走 uploadImage（复用上传+Yjs 管线）
function dataUrlToBlob(dataUrl: string): Blob {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

async function startScreenshot() {
  if (!props.isTeacher) return;
  if (!window.electronAPI?.captureScreen) {
    toast('截图需在桌面客户端中使用');
    return;
  }
  loading.value = true;
  let capUrl: string;
  try {
    capUrl = await window.electronAPI.captureScreen();
  } catch {
    capUrl = '';
  } finally {
    loading.value = false;
  }
  if (!capUrl) {
    toast('截屏权限被拒，请在系统设置中允许屏幕录制后重试');
    // 降级：剪贴板图片直接插入（§4.9 权限被拒路径）
    try {
      const clipUrl = await window.electronAPI.clipboardReadImage();
      if (!clipUrl) {
        toast('剪贴板无图片');
        return;
      }
      await uploadImage(
        new File([dataUrlToBlob(clipUrl)], '剪贴板截图.png', { type: 'image/png' })
      );
    } catch (err) {
      toast(`剪贴板图片读取失败: ${(err as Error).message}`);
    }
    return;
  }
  screenshotImg.value = capUrl;
  screenshotVisible.value = true;
}

function shotLocalPos(e: MouseEvent): { x: number; y: number } {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onShotMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  shotStart = shotLocalPos(e);
  shotSel.value = null;
}

function onShotMouseMove(e: MouseEvent) {
  if (!shotStart) return;
  const cur = shotLocalPos(e);
  shotSel.value = {
    x: Math.min(shotStart.x, cur.x),
    y: Math.min(shotStart.y, cur.y),
    w: Math.abs(cur.x - shotStart.x),
    h: Math.abs(cur.y - shotStart.y)
  };
}

function onShotMouseUp() {
  if (!shotStart) {
    resetScreenshot();
    return;
  }
  shotStart = null;
  const sel = shotSel.value;
  const capUrl = screenshotImg.value;
  resetScreenshot();
  // 微小拖拽/框外点击视为取消（不落元素）
  if (!sel || sel.w < 4 || sel.h < 4) return;
  void insertScreenshotCrop(sel, capUrl);
}

async function insertScreenshotCrop(
  sel: { x: number; y: number; w: number; h: number },
  capUrl: string
) {
  loading.value = true;
  try {
    const img = await loadImageEl(capUrl);
    const capW = img.naturalWidth || img.width;
    const capH = img.naturalHeight || img.height;
    const el = document.getElementById(containerId.value);
    // 遮罩 stretch 铺满容器：显示坐标 → 捕获像素按比例换算（v1 不做 letterbox 保原位心智）
    const cw = el?.clientWidth || 800;
    const ch = el?.clientHeight || 600;
    const sx = (sel.x / cw) * capW;
    const sy = (sel.y / ch) * capH;
    const sw = (sel.w / cw) * capW;
    const sh = (sel.h / ch) * capH;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast('截屏裁剪失败');
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = dataUrlToBlob(canvas.toDataURL('image/png'));
    // 原位对齐：框选左上角显示坐标 → 层坐标（评审否决"落入当前页中心"）
    const pos = toLayerCoords({ x: sel.x, y: sel.y });
    await uploadImage(new File([blob], '屏幕截图.png', { type: 'image/png' }), pos);
  } catch (err) {
    toast(`截屏插入失败: ${(err as Error).message}`);
  } finally {
    loading.value = false;
  }
}

// 预载全部页尺寸（阶段1）已抽至 whiteboard/pptImport.ts:loadPptMeta

async function uploadPPT(file: File): Promise<boolean> {
  if (!uploadPptApi) {
    toast('未配置PPT上传接口');
    return false;
  }
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
      fileUrl
    });
    if (!registered) {
      toast('课件登记服务端失败，请重试');
      return false;
    }
    provider?.addFileItem({
      filename: baseName,
      filext: ext,
      filesize: file.size,
      fileid: '',
      fileurl: fileUrl
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
  const items: Array<{
    id: string;
    filename: string;
    filext: string;
    filesize: number;
    fileUrl: string;
  }> = res.data?.list ?? [];

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

  const existing = new Set(
    provider
      .getFileList()
      .map(i => i.fileurl)
      .filter(Boolean)
  );
  const pending = items.filter(it => it.fileUrl && !existing.has(it.fileUrl));
  if (ghosts.length === 0 && pending.length === 0) return;

  for (const item of pending) {
    provider.addFileItem({
      filename: item.filename,
      filext: item.filext || 'ppt',
      filesize: Number(item.filesize) || 0,
      fileid: '',
      fileurl: item.fileUrl
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
    // TS 对闭包外层 let 收窄在嵌套函数内失效：捕获为 const 供事务闭包使用
    const p = provider;
    const startIdx = p.getPages().length;
    let layerIds: string[] = [];
    // 单事务建页并落到首张幻灯片：观察者提交时触发一次，直接切到目标页不闪页
    p.doc.transact(() => {
      layerIds = importPptPages(p, cw, ch, fileUrl, meta);
      p.setCurrentPageIndex(startIdx);
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
  if (!val) {
    toast('名字不能为空!');
    return;
  }
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
      const list: Array<{ id: string; fileUrl: string }> = res.data?.list ?? [];
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

function openExportDialog() {
  // 权限防线（D8 口径）：入口已随 isTeacher 隐藏，readOnly 场景（学生身份进房）仍拦截
  if (!props.isTeacher || provider?.readOnly) {
    toast('仅教师可导出');
    return;
  }
  exportScope.value = 'current';
  exportFormat.value = 'png';
  exportProgress.value = null;
  exportDialogVisible.value = true;
}

async function confirmExport() {
  // 导出期间禁用按钮防双开；无 provider/renderer（未挂载）不弹错误直接结束
  if (exporting.value || !provider || !renderer) return;
  const p = provider;
  const r = renderer;
  const total = exportScope.value === 'current' ? 1 : p.getPages().length;
  exporting.value = true;
  exportProgress.value = { done: 0, total };
  try {
    const stage = r.getStage();
    const outcome = await runExport({
      format: exportFormat.value,
      scope: exportScope.value,
      currentPage: p.getCurrentPageIndex(),
      pageCount: p.getPages().length,
      getElementsAt: index => p.getElementsAtPage(index),
      width: stage.width(),
      height: stage.height(),
      fileNameBase: `板书-${props.roomId}`,
      onProgress: (done, count) => {
        exportProgress.value = { done, total: count };
      }
    });
    exportDialogVisible.value = false;
    if (outcome === 'saved') toast('导出成功');
  } catch (err) {
    // 失败留在弹窗内：toast 可读错误，用户改选项或直接重试（§4.9 失败态）
    toast(`导出失败：${(err as Error).message}`);
  } finally {
    exporting.value = false;
    exportProgress.value = null;
  }
}

defineExpose({
  layerClear,
  tool,
  penType,
  selectPen,
  setPenType,
  addLayer,
  showLayer,
  showFile,
  openCourseware,
  delFile,
  delLayer,
  openExportDialog,
  confirmExport,
  exportDialogVisible,
  exportScope,
  exportFormat,
  exporting,
  exportProgress,
  setFileItemId: (index: number, fileid: string) => {
    provider?.setFileItemId(index, fileid);
    fileList.value = provider!.getFileList();
  },
  fileList,
  layerIndex,
  curLayerIndex,
  toastMsg,
  snapshotRetry,
  rendererPageCount: () => renderer?.getPageCount() ?? 0,
  renderedShapeCount: () => renderer?.getNodeCount() ?? 0,
  getCurrentPageShapes,
  importServerCoursewares,
  revocation,
  selectShape,
  selectColor,
  clearSelection,
  getSelectedShapeId,
  commitShapeMove,
  commitShapeTransform,
  // F4.3：文本样式提交
  commitTextStyle,
  toggleTextStyle,
  setSelAlign,
  selBold,
  selItalic,
  selAlign,
  alignOptions,
  deleteSelected,
  toLayerCoords,
  applyRemoteViewport,
  syncViewportToYjs,
  // F7.5：学生端跟随冲突横幅（模板渲染与点击恢复手动）
  followBanner,
  onFollowBannerClick,
  // F3.1：受力箭头预设武装（spec 与模板共用）
  FORCE_PRESETS,
  armedForceLabel,
  selectForceLabel,
  // F3.2：引线标注入口
  selectLeader,
  // F4.2：手绘图形规整开关
  regularizeEnabled,
  toggleRegularize,
  snapEnabled,
  toggleSnap,
  selIsTable,
  tableOp,
  showThumbPanel,
  toggleThumbPanel,
  thumbPages,
  jumpToThumb,
  showBoardReview,
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
    stageY: renderer?.getStage().y() ?? 0
  })
});
</script>

<style scoped lang="less">
@wbicon: '../../assets/imgs/whiteboard/wbicon-list.png';

@colorIcon: '../../assets/imgs/whiteboard/color-icon.png';

.classroom-white-board {
  width: 100%;
  height: 100%;
  position: relative;
}
.whiteBoard {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible;
  background: #fff;
}
.container {
  width: 100%;
  height: 100%;
  position: relative;
}

.cursor-text {
  cursor: text;
}
.cursor-brush {
  cursor:
    url('../../assets/imgs/whiteboard/m_brush.png') 2 22,
    crosshair;
}
.cursor-eraser {
  cursor:
    url('../../assets/imgs/whiteboard/m_eraser.png') 8 18,
    crosshair;
}
.cursor-move {
  cursor:
    url('../../assets/imgs/whiteboard/m_move.png') 8 18,
    grab;
}
.cursor-laser {
  cursor: crosshair;
}

.wb-pop-enter-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.wb-pop-leave-active {
  transition:
    opacity 100ms ease,
    transform 100ms ease;
}
.wb-pop-enter-from,
.wb-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.tools {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  background: #efeff4;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  gap: 4px;
  z-index: 10;
  div {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover {
      background-color: #e2e2e7;
    }
    &.on {
      background-color: #fff;
    }
    .el-icon {
      font-size: 16px;
      color: #555;
    }
    &.on .el-icon {
      color: #409eff;
    }
  }
  .circle,
  .rectangle,
  .eraser,
  .move {
    background-image: url('@{wbicon}');
    background-repeat: no-repeat;
  }
  // F4.1 笔型分段控件：32×32 内上下两段（钢笔/荧光笔），覆盖通用 div 规则
  .brush-seg {
    flex-direction: column;
    gap: 0;
    padding: 0;
    overflow: hidden;
    .seg {
      width: 32px;
      height: 16px;
      border-radius: 0;
      &:hover {
        background-color: rgba(64, 158, 255, 0.1);
      }
      &.active {
        background-color: rgba(64, 158, 255, 0.16);
      }
      .el-icon {
        font-size: 11px;
      }
      &.active .el-icon {
        color: #409eff;
      }
    }
    .seg-hl {
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      &.active .el-icon {
        color: #c8a400;
      }
    }
  }
  /* F4.2：笔型工具子菜单触发钮 + 规整开关行 */
  .seg-menu {
    width: 32px;
    height: 16px;
    border-radius: 0 0 6px 6px;
    .el-icon {
      font-size: 10px;
      color: #888;
    }
    &:hover .el-icon {
      color: #409eff;
    }
  }
  .rectangle {
    background-position: 0 -34px;
  }
  .move {
    background-position: -34px -68px;
  }
  .eraser {
    background-position: 0 -102px;
  }
  .circle {
    background-position: -68px -34px;
  }
  /* F3.1 受力箭头：文字图标 + 预设面板 */
  .force-icon {
    font-size: 15px;
    font-weight: 600;
    color: #555;
    font-style: italic;
  }
  &.force.on .force-icon {
    color: #409eff;
  }
  input[type='file'] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
}

.ctrl-tools {
  position: absolute;
  left: 64px;
  bottom: 10px;
  height: 36px;
  background: #efeff4;
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  gap: 2px;
  z-index: 10;
  div {
    width: 26px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    .el-icon {
      font-size: 14px;
      color: #555;
    }
    &:hover {
      background-color: #e2e2e7;
    }
  }
  .clear {
    background-image: url('@{wbicon}');
    background-repeat: no-repeat;
    background-position: -154px 0;
  }
  .num {
    width: auto;
    min-width: 48px;
    text-align: center;
    font-size: 12px;
    line-height: 26px;
    background: none;
    cursor: pointer;
    position: relative;
    .zoom-input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      text-align: center;
      font-size: 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      display: none;
    }
    &:hover .zoom-input {
      display: block;
    }
  }
}

.page-tools {
  position: absolute;
  right: 10px;
  bottom: 10px;
  height: 36px;
  background: #efeff4;
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  gap: 2px;
  z-index: 10;
  div {
    width: 26px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    .el-icon {
      font-size: 14px;
      color: #555;
    }
    &:hover {
      background-color: #e2e2e7;
    }
  }
  .num {
    width: auto;
    min-width: 36px;
    text-align: center;
    font-size: 12px;
    line-height: 26px;
    background: none;
  }
  .overview.on .el-icon {
    color: #409eff;
  }
}

/* F5.2：页面缩略图总览浮层（覆盖层，不改画布布局） */
.thumb-panel {
  position: absolute;
  right: 10px;
  bottom: 54px;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 10px;
  z-index: 12;
  .thumb-panel-title {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
  }
  .thumb-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .thumb-item {
    cursor: pointer;
    border: 2px solid transparent;
    border-radius: 6px;
    padding: 4px;
    text-align: center;
    &:hover {
      background: rgba(64, 158, 255, 0.08);
    }
    &.on {
      border-color: #409eff;
      background: rgba(64, 158, 255, 0.1);
    }
    .thumb-ph {
      height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f3f3f4;
      border-radius: 4px;
      font-size: 18px;
      color: #999;
    }
    .thumb-num {
      font-size: 11px;
      color: #666;
      margin-top: 2px;
    }
  }
}

.color-panel {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  will-change: transform, opacity;
  width: 180px;
  background: #f3f3f4;
  border-radius: 8px;
  padding: 12px;
  .color-panel-drag {
    width: auto;
    height: 14px;
    cursor: move;
    border-radius: 4px 4px 0 0;
    margin: -12px -12px 8px -12px;
    background: #e2e2e7;
  }
  .edit-size {
    margin-bottom: 12px;
  }
  /* F4.3：文本样式行（粗斜/对齐） */
  .text-style {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 12px;
    .ts-btn {
      width: 24px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      color: #555;
      &:hover {
        background: rgba(64, 158, 255, 0.1);
      }
      &.on {
        background: rgba(64, 158, 255, 0.18);
        color: #409eff;
      }
    }
    .ts-sep {
      width: 1px;
      height: 16px;
      background: rgba(0, 0, 0, 0.12);
      margin: 0 2px;
    }
  }
  .snap-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    .snap-label {
      font-size: 12px;
      color: #666;
    }
  }
  .table-ops {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
    .top-btn {
      flex: 1;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      font-size: 12px;
      color: #555;
      cursor: pointer;
      background: rgba(0, 0, 0, 0.04);
      &:hover {
        background: rgba(64, 158, 255, 0.15);
        color: #409eff;
      }
    }
  }
  .size-title {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #666;
    margin-bottom: 6px;
  }
  .strip {
    width: 130px;
    height: 10px;
    background: linear-gradient(to right, #ccc, #333);
    border-radius: 5px;
    position: relative;
    margin: 0 auto;
    cursor: pointer;
    .strip-btn {
      position: absolute;
      top: -3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid #666;
    }
  }
  .edit-color {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    .item {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid transparent;
      &.on {
        border-color: #409eff;
      }
      &.colours {
        background-image: url('@{colorIcon}');
        background-size: cover;
      }
    }
  }
  .opacity-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: #666;
    .opacity-label {
      white-space: nowrap;
      flex-shrink: 0;
    }
    .opacity-slider {
      flex: 1;
      min-width: 0;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: #ccc;
      border-radius: 2px;
      outline: none;
      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #409eff;
        cursor: pointer;
        border: 2px solid #fff;
        box-shadow: 0 0 2px #000;
      }
    }
    .opacity-val {
      min-width: 28px;
      text-align: right;
      flex-shrink: 0;
    }
  }
  .fill-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 10px;
    font-size: 12px;
    color: #666;
    .fill-label {
      white-space: nowrap;
    }
    .fill-toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 10px;
      border-radius: 10px;
      background: #eee;
      color: #666;
      cursor: pointer;
      border: 1px solid #ddd;
      user-select: none;
      &.on {
        background: #409eff;
        color: #fff;
        border-color: #409eff;
      }
      .fill-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 1px rgba(0, 0, 0, 0.4);
      }
    }
    .fill-palette {
      width: 100%;
      .fp-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .fp-item {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid rgba(0, 0, 0, 0.12);
        &.on {
          border-color: #409eff;
        }
      }
      .fp-none {
        padding: 2px 10px;
        border-radius: 10px;
        background: #f5f5f5;
        border: 1px dashed #bbb;
        color: #666;
        cursor: pointer;
        user-select: none;
        &:hover {
          background: #ececec;
        }
      }
    }
  }
  .pal-btn {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #444;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }
  .pallet-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding: 10px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    .pal-color {
      position: relative;
      width: 150px;
      height: 150px;
      canvas {
        display: block;
        width: 150px;
        height: 150px;
        border-radius: 50%;
        cursor: crosshair;
      }
    }
    .endSelectColor {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      .end-color-item {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        cursor: pointer;
        border: 1px solid rgba(0, 0, 0, 0.15);
      }
    }
  }
}

.color-panel-toggle {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  will-change: transform;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f3f3f4;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  .color-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 2px #000;
  }
}

.fileList {
  position: absolute;
  left: 60px;
  top: 50%;
  transform: translateY(-50%);
  width: 180px;
  max-height: 356px;
  background: #f3f3f4;
  border-radius: 8px;
  overflow-y: auto;
  padding: 8px;
  z-index: 10;
  pointer-events: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
  .file-upload {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 4px;
    margin-bottom: 4px;
    border: 1px dashed #c0c4cc;
    border-radius: 6px;
    cursor: pointer;
    color: #409eff;
    font-size: 12px;
    &:hover {
      background-color: #e8e8ec;
    }
    input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
  }
  .file-item {
    display: flex;
    align-items: center;
    padding: 6px 4px;
    border-bottom: 1px solid #e0e0e0;
    gap: 4px;
  }
  .file-name {
    flex: 1;
    font-size: 12px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    .file-name-input {
      width: 100%;
      font-size: 12px;
      border: 1px solid #ccc;
      border-radius: 2px;
      padding: 1px 4px;
    }
  }
  .file-size {
    font-size: 10px;
    color: #999;
  }
  .file-del {
    width: 16px;
    height: 16px;
    cursor: pointer;
    color: #999;
    &:hover {
      color: #e0383e;
    }
    .el-icon {
      font-size: 16px;
    }
  }
  .file-hint {
    margin-top: 6px;
    font-size: 10px;
    line-height: 1.5;
    color: #999;
  }
}

.loading-div {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  .loading-gif {
    width: 60px;
    height: 60px;
    color: #409eff;
    font-size: 48px;
  }
}

.alert {
  position: fixed;
  top: 40%;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 6px;
  font-size: 14px;
  z-index: 200;
  white-space: nowrap;
}

.snapshot-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  background: #fdf6ec;
  color: #e6a23c;
  border: 1px solid #faecd8;
  border-radius: 4px;
  font-size: 13px;
  z-index: 200;
  white-space: nowrap;
  pointer-events: none;
}

/* F7.5 跟随冲突横幅：底部常驻可点击（点击恢复手动），需接收点击事件 */
.follow-banner {
  top: auto;
  bottom: 8px;
  pointer-events: auto;
  cursor: pointer;
}

/* F4.2 笔型工具子菜单内容（el-popover）：手绘规整开关行 */
.seg-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #333;
}

/* F3.1 受力箭头预设面板（el-popover 内容）：标签芯片点选武装 */
.force-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .force-preset {
    min-width: 32px;
    padding: 2px 8px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    text-align: center;
    font-size: 13px;
    cursor: pointer;

    &:hover {
      background-color: rgba(64, 158, 255, 0.1);
      border-color: #409eff;
    }
  }
}

/* F4.6 截图框选遮罩：铺满白板区，展示屏幕捕获并支持拖拽框选 */
.screenshot-overlay {
  position: absolute;
  inset: 0;
  z-index: 300;
  cursor: crosshair;
  user-select: none;
  overflow: hidden;

  .screenshot-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill; /* stretch 铺满：显示坐标按比例直映捕获像素（v1 简化映射） */
    pointer-events: none;
  }

  .screenshot-sel {
    position: absolute;
    border: 2px solid #409eff;
    background: rgba(64, 158, 255, 0.15);
    pointer-events: none;
  }
}

/* F6.1 导出弹窗（teleport 到 body，scoped 属性随编译落在内容节点上仍生效） */
.export-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  .export-label {
    width: 36px;
    flex-shrink: 0;
    color: #666;
  }
}

.export-hint {
  margin-top: -4px;
  margin-bottom: 8px;
  color: #999;
  font-size: 12px;
}

.export-progress {
  margin-top: 8px;
  color: #409eff;
  font-size: 13px;
}

/* F1.1 公式工具按钮（∑ 字形，尺寸/悬停沿用 .tools div 通用规则） */
.formula-tool {
  .formula-tool-icon {
    font-size: 17px;
    font-weight: 600;
    color: #555;
    line-height: 1;
  }
  &:hover .formula-tool-icon {
    color: #409eff;
  }
}

/* F1.1 公式输入浮层（状态机：默认→输入中→红框错误→渲染中→已提交） */
.formula-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.18);
}

.formula-panel {
  width: 380px;
  background: #fff;
  border-radius: 10px;
  padding: 14px 16px 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.22);
}

.formula-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.formula-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: Consolas, 'SFMono-Regular', monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  outline: none;
  resize: vertical;
  &:focus {
    border-color: #409eff;
  }
  &.invalid {
    border-color: #e1383f;
    background: #fff5f5;
  }
}

.formula-error {
  margin-top: 6px;
  font-size: 12px;
  color: #e1383f;
}

.formula-loading {
  margin-top: 6px;
  font-size: 12px;
  color: #409eff;
}

.formula-chem {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.formula-chem-label {
  font-size: 12px;
  color: #666;
}

.formula-symbols {
  margin-top: 8px;
}

.formula-symbol-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.formula-symbol-tab {
  padding: 2px 8px;
  font-size: 12px;
  color: #666;
  background: #f2f3f5;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.formula-symbol-tab.on {
  color: #fff;
  background: #409eff;
}

.formula-symbol-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
  gap: 4px;
  margin-top: 6px;
  max-height: 96px;
  overflow-y: auto;
}

.formula-symbol-btn {
  padding: 4px 0;
  font-size: 14px;
  color: #333;
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
}

.formula-symbol-btn:hover {
  color: #409eff;
  border-color: #409eff;
}

.formula-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.formula-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #999;
}
</style>
