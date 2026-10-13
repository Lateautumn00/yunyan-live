# Spike 报告：F3.5 分子结构 / 3D 模型查看（3Dmol.js）

> 状态：**四项出口条件实测齐**，建议立项（见 §5 go/no-go）
> 实测环境：Electron 43.4.1 / Chrome 150 / win32（desktop 同版本）；原始数据 `spikes/evidence/results.json`，截图 `spikes/evidence/molecule-boot.png`
> 装置：`spikes/`（与 F3.4 共用 fetch-vendor + run-spike，可复跑，见 `spikes/README.md`）

## 1. 候选与选型

| 候选                 | 许可           | 体积（min） | 结论                                                                  |
| -------------------- | -------------- | ----------- | --------------------------------------------------------------------- |
| **3Dmol.js（选定）** | BSD-3-Clause   | ~533 KB     | 宽松许可；PDB/SDF/MOL2 等格式全；cartoon+surface 质量好；周下载 5 万+ |
| NGL viewer           | MIT            | ~1 MB+      | 备选，未实测（3Dmol 已达标）                                          |
| Mol*                 | MPL-2.0 / 自带 | 明显更重    | 否决：包体与渲染内存远超课堂查看需求                                  |
| RDKit.js             | Apache-2.0     | WASM ~10MB+ | 否决：面向化学结构编辑非 3D 查看，包体大                              |

实测样本：1CRN（crambin，327 原子）来自 RCSB；样式 cartoon（spectrum 色序）+ VDW 半透明 surface。

## 2. 出口条件四项实测

### ① 包体 ✅

| 资产                               | 实测值                     |
| ---------------------------------- | -------------------------- |
| 3Dmol-min.js（3dmol.org 官方构建） | **545,215 bytes ≈ 533 KB** |
| 1CRN.pdb 样例模型                  | 49,491 bytes ≈ 48 KB       |
| **合计**                           | **~581 KB**                |

远低于警戒线。sha256 见 `spikes/fetch-vendor.mjs` 运行输出（vendor 不入库，报告留痕）。

### ② 渲染内存 / 帧率 ✅

| 指标                              | 实测值                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| 启动                              | 页面加载 253ms + 渲染就绪 599ms（含 surface）                                |
| canvas                            | 1600×1200（800×600 CSS @ devicePixelRatio 2）                                |
| 帧率（1s rAF 采样，持续旋转重绘） | **61 fps**                                                                   |
| 帧率（静止）                      | **61 fps**（满帧，无空转抖动）                                               |
| JS heap（含 surface 计算峰值）    | ~25.3 MB                                                                     |
| JS heap（稳态）                   | ~19.9 MB                                                                     |
| renderer 进程 workingSet          | ~146 MB（含 WebGL/Chromium 基线）                                            |
| 渲染正确性                        | canvas 非空（着色像素比 9.75%）；旋转→重绘 校验通过（`rotateRedraws: true`） |

结论：满帧 + 内存增量 ~25MB，课堂投影/共享视图场景无压力。

### ③ 许可 ✅

- **BSD-3-Clause**（3Dmol.js 主体）；内含 GLmol（MIT/LGPL 双许可）与 Three.js（MIT）代码，官方 LICENSE 文件已注明——宽松许可组合，**无 copyleft 传染风险**，随专有安装包分发只需保留版权与许可声明
- 对比 F3.4（GPL-2.0）：本项许可合规成本近零

### ④ 离线环境 ✅

- 与 F3.4 合并跑：`externalRequestCount = 0`（全程仅 spike:// 本地协议）
- 3Dmol-min.js 单文件 + PDB 文本文件，经 `atom://` 类协议加载路径与 spike 同形态
- 预置模型库：PDB 为纯文本，每模型几十 KB，可按需扩充内置库（如常见教学蛋白 1CRN/4N8T/1MO8）

### 渲染证据

`spikes/evidence/molecule-boot.png`：1CRN cartoon（spectrum 色序）+ 白色半透明 VDW surface，渲染正确。

## 3. 若立项方案草案

- 独立浮层/窗口内 iframe 或直接页面组件（3Dmol 为普通 JS 库，无需 iframe 亦可集成；iframe 隔离更利于失败降级）
- 模型资源：内置预置 PDB 库（包体每模型 <50KB）+ 教师端本地文件导入
- 共享同步：**不入 Yjs 文档**——以 awareness 广播"共享视图开合 + 当前模型 id"（参照 YjsProvider.setSpotlight 模式）；旋转/缩放为查看态不强制同步
- 课件页 ✗（外挂形态，与规格 §4.3 一致）
- 测试面：正 = 视图开合状态广播、模型加载占位/失败降级（§4.9）；负 = 无模型文件报错不崩、学生端只读

## 4. 已知限制

1. `performance.memory` 为 Chromium 私有接口，度量值受 GC 时机影响（报告值为稳态采样）
2. 大分子（>5000 原子，如病毒衣壳）surface 计算会显著变慢——预置库选取教学常用小蛋白即可规避；立项时可对超大模型降级为 cartoon-only
3. 3Dmol `viewer.version` 字段在官方 min 构建中不可读（harness `version: null`），版本追踪以 vendor 文件 sha256 为准

## 5. Go / No-Go 建议

**建议：GO（立项）**。四项出口全绿；BSD 许可无合规负担；581KB 包体 + 满帧 + ~25MB 内存为本轮 spike 中风险最低项。

待产品确认项（2026-10-13 依据实施确认，助手代勾）：

- [x] 入口形态拍板：独立窗口 vs 页内浮层（与 F3.4 入口统一考虑）—— 定案**页内浮层**（与 F3.4 同一 SharedViewOverlay，commit `d6d2e72`）
- [x] 预置模型库清单（首批建议：蛋白质 1CRN / 4N8T，小分子 caffeine 7MQ）—— 定案照建议执行（commit `f8155fb`）

## 6. 人工复核清单（≤5 分钟）

1. 鼠标拖拽旋转/滚轮缩放手感（合成旋转已验证重绘链路，真实指针手感未验）
2. WebGL 在教师机/学生机核显上的实际观感（本机为开发机 GPU）
