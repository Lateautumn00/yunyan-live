export interface ToolState {
  type: 'cur' | 'brush' | 'eraser' | 'rect' | 'circle' | 'arrow' | 'text' | 'move' | 'upload' | 'file';
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
  fileid: string;
}

export const DEFAULT_TOOL: ToolState = {
  type: 'cur',
  color: '#000000',
  lineWidth: 1,
  fontSize: 14,
  opacity: 1,
};

export const PRESET_COLORS = [
  '#000000', '#818181', '#B3B3B3', '#FFFFFF',
  '#e1383f', '#f8821a', '#fec726', '#61ba47',
  '#03cfcc', '#017aff', '#963d95',
];
