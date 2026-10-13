# 研发收尾清单（Closure Checklist）

> 基线：`feat/stage3-math-chem` 与 `origin/main` 0 分叉（ff-only 可合并）
> 代码侧：42/42 项全部完成（阶段 0–4），四门禁全绿；**本清单只收集人工/流程项**
> 用法：逐项勾选；每项标注前置条件，前置未满足不得跳步

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

## 6. F5.4 保真 runner 收尾（LO 虚拟机 bug，parked）

- [ ] 修复生成器 OOXML 使 LO 可加载
- [ ] 虚拟机产出 `baseline.json` 人工复核入库
- [ ] 勾掉 `courseware-conversion-plan.md` §7 最后一项 checkbox

现状：`a5192ba` 已修复 it.each 注册时机，6 个转换用例在虚拟机正常注册执行；全部失败于 `soffice 转换失败：source file could not be loaded`——手写 OOXML 结构被 LibreOffice 拒载（CI zip 级校验通过，属更深层文档结构问题）。
恢复路径：虚拟机 `pip install python-pptx` 生成已知可打开的参考 pptx，解包后 `diff -r` 对比 `apps/server/test/fixtures/courseware/` 下生成的 fixture，一次性定位缺失/畸形部件（疑点：slideMaster 缺 `p:txStyles`、presentation 缺 `p:defaultTextStyle`、presentation.xml.rels 非标准 theme 直引）→ 修 `generate-courseware-fixtures.mjs` → 虚拟机重跑 `FIDELITY_WRITE_BASELINE=1 COURSEWARE_FIDELITY=1 pnpm --filter @yunyan-live/server test` → 复核入库。

## 7. 合并 main（用户手动执行）

- [ ] 前置：第 1–6 节全部完成（至少 §1 签批 + §2 验收 + §3 上线相关项若同期上线）
- [ ] 执行：`git checkout main && git merge --ff-only feat/stage3-math-chem && git push origin main`
- [ ] 合并后保留远程 `feat/stage3-math-chem`（与 stage0/1/2 惯例一致）

已验证：HEAD 含 origin/main 全部提交、0 分叉，ff-only 快进可行（`stage3-exit-checklist.md` §5）。

## 8. 远期复核

- [ ] Q6 报告 12 个月强制复核（2027-10）：tldraw 商业授权「不预留」结论 + 换引擎独立立项前提重估（`whiteboard-teaching-features.md` §10）
