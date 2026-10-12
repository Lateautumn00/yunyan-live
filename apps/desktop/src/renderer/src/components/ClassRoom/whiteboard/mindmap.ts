/** F4.7 思维导图：节点几何与布局常量（渲染端与组件端共用，单节点 120×36） */
export type MindNodeData = {
  id: string;
  text: string;
  parentId: string | null;
  x: number;
  y: number;
};

export const MIND_W = 120;
export const MIND_H = 36;
// 子节点落点：父右缘 + 30 间隙；同级/多子逐行下移
export const MIND_GAP_X = 150;
export const MIND_GAP_Y = 44;
