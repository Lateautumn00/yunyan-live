/**
 * 工具栏信息架构（§4.9.2 落地）：教师端左侧栏 = 7 直达 + 4 分组。
 * 激光笔为独立直达键（不在分组内）；配置纯数据、零业务逻辑；激活 handler 收口在 WhiteBoard.vue 的 runToolbarChild。
 */

export type ToolbarIcon =
  { kind: 'el'; name: string } | { kind: 'glyph'; char: string } | { kind: 'sprite'; cls: string };

export interface ToolbarGroupChild {
  /** 记忆键 + data-tool：与 ToolMode 同名的直接调 tool(id)，其余走 WhiteBoard 分支 */
  id: string;
  label: string;
  tooltip: string;
  icon: ToolbarIcon;
  /** 关联 ToolMode（分组钮 on 高亮判定）；旁路工具（浮层/开关类）缺省 */
  mode?: string;
}

export interface ToolbarGroupDef {
  id: string;
  label: string;
  /** 首跑默认（无记忆时）：形状=圆、标注=受力、学科=公式、资源=素材 */
  defaultChildId: string;
  children: ToolbarGroupChild[];
}

/** 分组钮主区 tooltip 模板：「组名 · 当前工具（点击使用，▸ 展开全部）」 */
export function groupTip(g: ToolbarGroupDef, childLabel: string): string {
  return `${g.label} · ${childLabel}（点击使用，▸ 展开全部）`;
}

export const TOOLBAR_GROUPS: ToolbarGroupDef[] = [
  {
    id: 'shape',
    label: '形状',
    defaultChildId: 'circle',
    children: [
      {
        id: 'circle',
        label: '圆形',
        tooltip: '圆形工具 · 拖拽画椭圆，按住 Shift 画正圆',
        icon: { kind: 'sprite', cls: 'circle' },
        mode: 'circle'
      },
      {
        id: 'rectangle',
        label: '矩形',
        tooltip: '矩形工具',
        icon: { kind: 'sprite', cls: 'rectangle' },
        mode: 'rectangle'
      },
      {
        id: 'line',
        label: '直线',
        tooltip: '直线工具 · 按住 Shift 锁定水平/垂直',
        icon: { kind: 'el', name: 'Minus' },
        mode: 'line'
      },
      {
        id: 'arrows',
        label: '箭头',
        tooltip: '箭头工具',
        icon: { kind: 'el', name: 'Promotion' },
        mode: 'arrows'
      },
      {
        id: 'polygon',
        label: '多边形',
        tooltip: '多边形 · 逐点取顶点，点击首点闭合（Esc 取消）',
        icon: { kind: 'glyph', char: '△' },
        mode: 'polygon'
      },
      {
        id: 'point',
        label: '点',
        tooltip: '点工具 · 单击落点（吸附附近端点/中点）',
        icon: { kind: 'glyph', char: '●' },
        mode: 'point'
      }
    ]
  },
  {
    id: 'annotate',
    label: '标注',
    defaultChildId: 'force',
    children: [
      {
        id: 'force',
        label: '受力箭头',
        tooltip: '受力箭头 · 预设标签拖出方向，双击改标签',
        icon: { kind: 'glyph', char: 'F' },
        mode: 'force'
      },
      {
        id: 'leader',
        label: '引线',
        tooltip: '引线标注 · 点击被指对象拖出标签，双击改文字',
        icon: { kind: 'el', name: 'Right' },
        mode: 'leader'
      },
      {
        id: 'table',
        label: '表格',
        tooltip: '表格 · 点击落点插入 3×3，选中后增删行列，双击编辑单元格',
        icon: { kind: 'el', name: 'Grid' },
        mode: 'table'
      },
      {
        id: 'mask',
        label: '蒙层',
        tooltip: '蒙层 · 拖拽覆盖内容，单击揭开，拖开后可 Delete',
        icon: { kind: 'el', name: 'Hide' },
        mode: 'mask'
      },
      {
        id: 'spotlight',
        label: '聚光灯',
        tooltip: '聚光灯 · 遮罩高亮窗口，拖动移窗，Esc 关闭',
        icon: { kind: 'el', name: 'Sunny' }
      },
      {
        id: 'magnifier',
        label: '放大镜',
        tooltip: '放大镜 · 滚轮调倍率，Esc 关闭',
        icon: { kind: 'el', name: 'ZoomIn' }
      }
    ]
  },
  {
    id: 'subject',
    label: '学科',
    defaultChildId: 'formula',
    children: [
      {
        id: 'formula',
        label: '公式',
        tooltip: '公式 · LaTeX 输入（Enter 提交，Esc 取消）',
        icon: { kind: 'glyph', char: '∑' }
      },
      {
        id: 'curve',
        label: '函数图像',
        tooltip: '函数图像 · 输入 y=f(x) 生成曲线',
        icon: { kind: 'glyph', char: 'f(x)' }
      },
      {
        id: 'coord',
        label: '坐标系',
        tooltip: '坐标系 · 点击落点插入，选中可锁定/关网格',
        icon: { kind: 'el', name: 'Aim' },
        mode: 'coord'
      },
      {
        id: 'mindmap',
        label: '思维导图',
        tooltip: '思维导图 · 双击空白建根节点，Tab/Enter 增子/同级，Esc 退出',
        icon: { kind: 'el', name: 'Share' },
        mode: 'mindmap'
      },
      {
        id: 'circuit',
        label: '电路实验室',
        tooltip: '电路实验室 · 页内浮层，学生同步可见',
        icon: { kind: 'el', name: 'Cpu' }
      },
      {
        id: 'molecule',
        label: '分子模型',
        tooltip: '分子模型 · 页内浮层，学生同步可见',
        icon: { kind: 'el', name: 'Sugar' }
      }
    ]
  },
  {
    id: 'resource',
    label: '资源',
    defaultChildId: 'assets',
    children: [
      {
        id: 'assets',
        label: '素材收藏',
        tooltip: '素材收藏 · 导入本地图入收藏，点击入画布',
        icon: { kind: 'el', name: 'Picture' }
      },
      {
        id: 'media',
        label: '媒体',
        tooltip: '媒体 · 插入页内音视频（链接跨端同步，本地文件仅本机可播）',
        icon: { kind: 'el', name: 'Film' }
      },
      {
        id: 'upload',
        label: '上传图片',
        tooltip: '上传图片 · 贴到当前页',
        icon: { kind: 'el', name: 'PictureFilled' }
      },
      {
        id: 'screenshot',
        label: '截图',
        tooltip: '截图 · Ctrl+Shift+X 框选屏幕区域插入',
        icon: { kind: 'el', name: 'Crop' }
      },
      {
        id: 'courseware',
        label: '我的课件',
        tooltip: '我的课件',
        icon: { kind: 'el', name: 'FolderOpened' }
      },
      {
        id: 'export',
        label: '导出板书',
        tooltip: '导出板书 · PNG/PDF（仅教师）',
        icon: { kind: 'el', name: 'Download' }
      }
    ]
  }
];

/** 记忆键带版本前缀：结构变更时换前缀作废旧键，损坏数据回退默认 */
export const TOOLBAR_MEM_KEY = 'wb.toolbarMem.v1';

export function loadToolbarMem(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOOLBAR_MEM_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const mem: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') mem[k] = v;
    }
    return mem;
  } catch {
    return {};
  }
}

export function saveToolbarMem(mem: Record<string, string>): void {
  try {
    localStorage.setItem(TOOLBAR_MEM_KEY, JSON.stringify(mem));
  } catch {
    /* 隐私模式/配额满：静默降级为会话内记忆 */
  }
}

/** 记忆子项解析：记忆值不在组内（或缺失）→ 回退 defaultChildId */
export function rememberedChild(
  g: ToolbarGroupDef,
  mem: Record<string, string>
): ToolbarGroupChild {
  const remembered = mem[g.id];
  const hit = g.children.find(c => c.id === remembered);
  if (hit) return hit;
  return g.children.find(c => c.id === g.defaultChildId) ?? g.children[0]!;
}
