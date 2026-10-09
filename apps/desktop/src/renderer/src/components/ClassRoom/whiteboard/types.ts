/** UI 工具模式（mode 侧）：工具栏按钮与 setMode 写入的字面量全集 */
export type ToolMode =
  | 'cur'
  | 'brush'
  | 'eraser'
  | 'text'
  | 'circle'
  | 'rectangle'
  | 'arrows'
  | 'line'
  | 'move'
  | 'laser'
  | 'file';

/** 笔型分段控件状态（F4.1）：钢笔/荧光笔，持久工具态（切换工具后记忆，重进房恢复） */
export type PenType = 'pen' | 'highlight';

export interface ToolState {
  type: ToolMode;
  color: string;
  lineWidth: number;
  fontSize: number;
  opacity: number;
  penType: PenType;
}

/** Yjs 元素 type（element 侧）：KonvaRenderer.createNode 工厂注册的字面量全集 */
export const ELEMENT_TYPES = [
  'brush',
  'eraser',
  'rect',
  'circle',
  'arrow',
  'line',
  'text',
  'ppt-image',
  'image'
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export function isElementType(value: unknown): value is ElementType {
  return typeof value === 'string' && (ELEMENT_TYPES as readonly string[]).includes(value);
}

/** mode → element 显式对照：双套命名（rectangle/rect、arrows/arrow）的唯一权威转换。
 *  cur/move/laser/file 不产出元素，故缺席 */
export const MODE_TO_ELEMENT: Partial<Record<ToolMode, ElementType>> = {
  brush: 'brush',
  eraser: 'eraser',
  text: 'text',
  circle: 'circle',
  rectangle: 'rect',
  arrows: 'arrow',
  line: 'line'
};

export interface CursorData {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
}

export interface FileItem {
  filename: string;
  filext: string;
  filesize: number;
  /** 点击列表创建课件页后回填为各页 id（空串 = 仅登记，尚未建页） */
  fileid: string;
  /** 课件源 PDF 地址（服务端课件表的关联键，用于进房导入去重） */
  fileurl?: string;
}

export const DEFAULT_TOOL: ToolState = {
  type: 'cur',
  color: '#000000',
  lineWidth: 1,
  fontSize: 14,
  opacity: 1,
  penType: 'pen'
};

/** 荧光笔预设（F4.1 交互写死）：切换至荧光笔时应用亮黄与钢笔 1.5× 宽，仍走颜色/线宽管线 */
export const HIGHLIGHT_COLOR = '#ffeb3b';
export const HIGHLIGHT_WIDTH_MULT = 1.5;

/** 橡皮白盖显示宽度倍数：拖拽预览与落库渲染同源，lineWidth 存滑杆基值 */
export const ERASER_WIDTH_MULT = 3;

/** 选择器最小命中描边宽度(px)：Konva 默认 hit 图按 strokeWidth 生成，1px 笔迹选择器点不中 */
export const HIT_STROKE_MIN = 12;

export const PRESET_COLORS = [
  '#000000',
  '#818181',
  '#B3B3B3',
  '#FFFFFF',
  '#e1383f',
  '#f8821a',
  '#fec726',
  '#61ba47',
  '#03cfcc',
  '#017aff',
  '#963d95'
];
