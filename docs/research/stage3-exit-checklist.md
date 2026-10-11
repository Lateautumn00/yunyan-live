# 阶段 3 准出走查清单（Stage 3 Exit Checklist）

> 基线：`feat/stage3-math-chem` @ `0d571ed`（已推 origin），领先 `origin/main` 51 提交，0 分叉
> 依据：`docs/research/whiteboard-teaching-features.md` §7 阶段对账、§8.1 阶段门与交付物
> 本文件为执行记录，**不修改已评审的研究文档**；合并动作待第 3、4 节完成并确认后执行

## 1. 交付物对照

阶段 3 = 6 项 Should；本分支另**补做阶段 2 遗留的 F5.2 缩略图总览 3 批**（§8.1 阶段 2 交付物含缩略图，此前缺口在阶段 3 验收后补齐）
stage3 自有 12 笔提交，相对 stage2 tip（`3d0bb65`）变更 21 文件 +3780/−36

| ID   | 功能                 | 主 commit                               | 关键实现                                                       | 主要 spec                                                                      |
| ---- | -------------------- | --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| F1.2 | 化学方程式 mhchem    | `40f85d5`                               | symbols 化学模式与 `\ce` 校验；formulaRaster 扩展              | symbols.spec 4 + formulaRaster.spec 9 + WhiteBoard                             |
| F1.3 | 符号快捷面板         | `0f878f4`                               | 分组页签与光标处插入                                           | symbols.spec 4 + WhiteBoard                                                    |
| F2.1 | 直角坐标系/网格      | `9c0bc1d`                               | 插入与锁定                                                     | WhiteBoard                                                                     |
| F2.2 | 函数图像绘制         | `4188955`                               | 白名单解析、懒加载曲线（mathjs）                               | curve.spec 7 + WhiteBoard                                                      |
| F2.3 | 几何作图与吸附       | `c363f7c` `801977f` `8a90cf9` `6957387` | geoSnap 纯函数、点/多边形、绘制期吸附、平行/垂直               | geoSnap.spec 11 + KonvaRenderer.spec 58 + WhiteBoard                           |
| F3.3 | 学科素材库           | `1eaeb56`                               | assetStore 本地图收藏与点击入画布                              | assetStore.spec 3 + WhiteBoard                                                 |
| F5.2 | 页面缩略图总览与排序 | `710a8a4` `8be9949` `0d571ed`           | pageSnapshot 离屏快照、movePage 拖拽排序、批量删除 + 10 秒撤销 | pageSnapshot.spec 5 + YjsProvider.spec +6 + KonvaRenderer.spec +3 + WhiteBoard |

**Should DoD 前置已满足**：每项开工前先写红灯 spec（1 正向 + 1 负向），再实现转绿。

## 2. 门禁记录（四门禁 @ `0d571ed`）

| 门禁      | 命令                                   | 结果                      |
| --------- | -------------------------------------- | ------------------------- |
| typecheck | `pnpm --filter desktop typecheck`      | 0 error                   |
| eslint    | `pnpm --filter desktop lint`           | 0 problem                 |
| prettier  | `pnpm format:check`                    | 0 issue                   |
| vitest    | `pnpm exec vitest run`（apps/desktop） | **601 passed / 45 files** |

测试数：阶段 3 末（`6957387`）572 → F5.2 三批后 601（+29，均为本阶段新增红灯转绿）。
关键 spec 计数：WhiteBoard 206、KonvaRenderer 58、YjsProvider 41、geoSnap 11、formulaRaster 9、curve 7、pageSnapshot 5、symbols 4、assetStore 3。

## 3. 人肉待办（未全部勾选不得签批 / 不得进阶段 4）

- [ ] 数学教师试讲走查（F2.1 / F2.2 / F2.3 / F3.3）—— §8.1 阶段 3 实现走查
- [ ] 化学教师试讲走查（F1.2 / F1.3）
- [ ] F1.2 / F1.3 实机验收（此前遗留）
- [ ] F5.2 实机验收：总览拖拽排序、批量删除 10 秒撤销、快照刷新、撤销跳页
- [ ] UI 项按 4.8 节五维 DoD 逐项走查
- [ ] 环境矩阵：触摸一体机 / 高 DPI 屏 / 网络三档（正常、200ms 延迟 + 5% 丢包、断网重连）
- [ ] 走查问题闭环（有则开票修复，回本清单勾选）

## 4. 签批（§8 阶段门：签批人 = 产品负责人 + CTO）

| 角色       | 姓名 | 日期 | 结论 |
| ---------- | ---- | ---- | ---- |
| 产品负责人 |      |      |      |
| CTO        |      |      |      |

## 5. 合并策略（已验证，待执行确认）

- `feat/stage3-math-chem` → `main` 采用 **ff-only**：HEAD 含 `origin/main` 全部提交、0 分叉
- 本地 `main` 的 `f7fae85`（研究文档）是 HEAD 祖先，快进后一并带上
- 远程 `feat/stage3-math-chem` 保留（与 stage0/1/2 惯例一致）
