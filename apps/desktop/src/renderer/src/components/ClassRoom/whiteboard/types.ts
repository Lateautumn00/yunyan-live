export interface ToolState {
  type: 'cur' | 'brush' | 'eraser' | 'rect' | 'circle' | 'arrow' | 'text' | 'move' | 'file';
  color: string;
  lineWidth: number;
  fontSize: number;
  opacity: number;
}

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
};

/** 橡皮白盖显示宽度倍数：拖拽预览与落库渲染同源，lineWidth 存滑杆基值 */
export const ERASER_WIDTH_MULT = 3;

export const PRESET_COLORS = [
  '#000000', '#818181', '#B3B3B3', '#FFFFFF',
  '#e1383f', '#f8821a', '#fec726', '#61ba47',
  '#03cfcc', '#017aff', '#963d95',
];
