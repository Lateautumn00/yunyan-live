# 研发收尾清单（Closure Checklist）

> 基线：`feat/stage3-math-chem` 与 `origin/main` 0 分叉（ff-only 可合并）
> 代码侧：42/42 项全部完成（阶段 0–4），四门禁全绿；**本清单只收集人工/流程项**
> 用法：逐项勾选；每项标注前置条件，前置未满足不得跳步
> 对账（2026-10-17，GAP-P4）：§7 已失效（分支远端不存在，内容已入 main）；持续缺口台账见 `system-gap-analysis.md`

## 1. 阶段 3 准出签批（人工签名）

- [ ] 产品负责人签名（日期 + 结论）
- [ ] CTO 签名（日期 + 结论）

操作：打开 `docs/research/stage3-exit-checklist.md` 第 4 节签批表，填写姓名/日期/结论。第 3 节人肉待办已于 2026-10-11 全部验收通过，签批表为唯一遗留。

## 2. 真机手动验收（自动化覆盖不到）

- [ ] F3.4 电路图浮层手感走查（`spike-f3.4-circuit.md` §7）：① iframe 内拖拽画线跟手 ② Tab 焦点切换符合课堂预期 ③ 全屏进出无闪烁
- [ ] F3.5 分子模型手感走查（`spike-f3.5-molecule.md` §6）：① 拖拽旋转/滚轮缩放手感 ② WebGL 在教师机/学生机核显观感
- [ ] F3.4/F3.5 截图回填入画布实机走查（SharedViewOverlay「插入画布」→ 画布 image 元素 + 学生端同步）
- [ ] F6.4 时间轴过程回放实机验收（播放/暂停/seek/倍速、按页分段、空流空态）——jsdom 不可覆盖
- [ ] F6.5 微课录制实机验收（录屏权限拒绝提示、开始/停止序列、文件就绪等待态）——jsdom 不可覆盖
- [ ] 工具栏 IA 分类收纳实机走查（§4.9.2，2026-10-13 落地）：① 4 分组 ▸ 展开/互斥手感与误触率 ② 记忆回显（图标随上次子项变化）跨会话恢复 ③ 小屏（≤768px 高）8 项全部可达 ④ 老教师肌肉记忆迁移体验（公式/截图入组是否顺手）

前置：桌面端可运行环境（`pnpm dev:desktop`）+ Janus 环境（F6.5）。建议与阶段 3 已完成的环境矩阵走查合并一次执行。

## 3. 法务会签（F6.1–F6.3 上线前硬门，未启动）

- [ ] Q4 可见范围结论会签（课后回看 MVP 仅教师；学生入口以越权 403 测试 + 合规评审为前置）
- [ ] 留存期限与删除权确认（Q8：快照保留策略 N 次课 + 归档）
- [ ] 班级级鉴权与越权 403 测试通过（Q9 / 5.9.2 鉴权模型）
- [ ] 导出边界确认（水印/脱敏按产品结论）
- [ ] 个保法影响评估（课堂板书可能含未成年人个人信息）

依据：`whiteboard-teaching-features.md` §8.1「上线门（数据合规，Q4 联动）」。**F6.1/F6.2/F6.3 任一上线前必须全勾**；与合并动作解耦（代码可先合，上线另行卡点）。

## 4. F5.4 二期产品拍板（`courseware-conversion-plan.md` §8）

- [ ] 首期范围追认（D 失败路径 + A 参数调优 + B 字体文档 + 样例集骨架，均已在分支落地）
- [ ] 字体采购边界（教育字库预算/授权意愿，或仅开源思源/Noto 覆盖）
- [ ] 二期 C 类工具许可形态（ONLYOFFICE/Aspose 的 AGPL 义务/商业付费可接受度）

## 5. 评审决策点补录（`whiteboard-teaching-features.md` §10 遗留）

- [ ] Q7-a 阶段 1 需求向走查记录补录（2–3 人半天走查结论存档；若当时未做，补做或产品书面豁免）
- [ ] Q10 F1.1 输入形态追认（以已交付输入浮层形态为准追认，或提出返工）
- [ ] Q11 ≤50 人/键鼠办公机假设追认（现行性能阈值按该假设验收，或触发 §4.9 阈值上调）

## 6. F5.4 保真 runner 收尾（LO 虚拟机 bug，parked）—— 已关闭（2026-10-13，用户验收通过）

- [x] 修复生成器 OOXML 使 LO 可加载 —— 实际根因为虚拟机 PATH 上的 Ubuntu `libreoffice-core` **缺 Impress 过滤器**（`libsdlo.so` 不存在），生成器 OOXML 无罪；经 `/opt/libreoffice26.8` 全功能安装直接转换成功。另修真 bug：`typeface` 未写入 XML（`11bc1e0`）
- [x] 虚拟机产出 `baseline.json` 人工复核入库 —— LO 26.8.0.3，144/144 全绿，页数与哈希复核通过
- [x] 勾掉 `courseware-conversion-plan.md` §7 最后一项 checkbox

处置记录：保真套件经 `SOFFICE_PATH=/opt/libreoffice26.8/program/soffice` 规避混装环境；fixtures README 已改为安装 `libreoffice-impress`（原「python-pptx 参考 diff」恢复路径未使用）。

## 7. 合并 main（用户手动执行）

> **已失效（2026-10-17 对账，GAP-P4）**：本节所引分支 `feat/stage3-math-chem` 在远端已不存在
> （origin 仅剩 `main @ 0ef8533`），阶段 3 内容（签到等）已在 main 历史中
> （如 `19f2842 feat(desktop): add classroom checkin panel...`）。原"ff-only 合并"动作无需执行。
> 对账依据：`docs/research/system-gap-analysis.md` §9。

- [x] 前置：第 1–6 节全部完成（至少 §1 签批 + §2 验收 + §3 上线相关项若同期上线）——随本节失效一并关闭
- [x] 执行：`git checkout main && git merge --ff-only feat/stage3-math-chem && git push origin main`——分支不存在，动作取消
- [x] 合并后保留远程 `feat/stage3-math-chem`（与 stage0/1/2 惯例一致）——远程无该分支，无需保留

已验证：HEAD 含 origin/main 全部提交、0 分叉，ff-only 快进可行（`stage3-exit-checklist.md` §5）——历史记录，仅存档。

## 8. 远期复核

- [ ] Q6 报告 12 个月强制复核（2027-10）：tldraw 商业授权「不预留」结论 + 换引擎独立立项前提重估（`whiteboard-teaching-features.md` §10）
