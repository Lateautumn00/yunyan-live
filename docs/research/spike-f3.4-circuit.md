# Spike 报告：F3.4 电路图工具（CircuitJS1 外挂 iframe）

> 状态：**四项出口条件实测齐**，建议立项（见 §6 go/no-go）
> 实测环境：Electron 43.4.1 / Chrome 150 / win32（desktop 同版本）；原始数据 `spikes/evidence/results.json`，截图 `spikes/evidence/circuit-boot.png`
> 装置：`spikes/`（fetch-vendor + harness + run-spike，可复跑，见 `spikes/README.md`）

## 1. 候选与选型

| 候选                   | 许可             | 产物形态               | 结论                                                 |
| ---------------------- | ---------------- | ---------------------- | ---------------------------------------------------- |
| **CircuitJS1（选定）** | GPL-2.0-or-later | 纯静态 Web（Vite/ESM） | 唯一成熟浏览器电路仿真；falstad.com 官方同源；功能全 |
| SEVA77 Desktop Mod     | GPL-2.0-or-later | NW.js 桌面壳           | 仅作"离线桌面可行"旁证，不引入                       |
| 自研                   | —                | —                      | Q1 已否（7/7 拍板走外挂）                            |

注：新版 CircuitJS1（pfalstad.github.io/circuitjs1）已从经典 GWT 构建迁移到 Vite/ESM，入口 `circuitjs.html` + 哈希分块 JS；包体远小于旧 GWT 产物。

## 2. 出口条件四项实测

### ① 包体 / 内存实测 ✅

| 指标                      | 实测值                                            |
| ------------------------- | ------------------------------------------------- |
| 全量镜像包体              | **2.12 MB**（403 文件，2,219,092 bytes）          |
| — 应用本体（JS/CSS/字体） | ~1.25 MB（35 文件）                               |
| — 内置示例电路            | ~0.55 MB（setuplist.txt + circuits/ 全量 368 例） |
| 启动                      | 页面加载 2393ms（spike:// 协议）+ 应用 boot 764ms |
| renderer JS heap          | ~7.1 MB                                           |
| renderer 进程 workingSet  | ~111 MB（含 Chromium 渲染进程基线）               |

结论：包体 +2.12MB 完全可接受（远低于评审 20MB 警戒线）。

### ② 许可审查 ✅（有附加义务，见 §4）

- **GPL-2.0-or-later**（仓库 `COPYING.txt`；about 页与源码头声明一致）
- 本 spike 全程**未修改**上游产物，纯镜像
- 分发合规两案对比见 §4

### ③ Electron iframe 交互（焦点 / 快捷键 / 全屏）✅

在与生产一致的 webPreferences（`sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`）下：

| 测试项                         | 结果                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| sandbox iframe contentDocument | 可访问（同源自定义协议 spike://，对应生产 atom://）                          |
| 焦点路由（iframe 聚焦时键盘）  | ✅ keydown 到达 iframe document（`iframeKeys: ["v"]`）                       |
| 焦点路由（iframe 失焦后键盘）  | ✅ keydown 到达父页面（`parentKeys: ["p"]`）                                 |
| iframe `requestFullscreen`     | ✅ `fullscreenEnabled: true`，请求成功 `err: null`，`fullscreenElement` 生效 |
| BrowserWindow.setFullScreen    | ✅ 窗口级全屏正常                                                            |

结论：外挂浮窗内 Esc/快捷键、全屏演示链路无阻塞。

### ④ 离线可用（资源内置）✅

- `session.webRequest.onBeforeRequest` 全程计数：**externalRequestCount = 0**（零外部请求）
- 资源经 `spike://` 自定义协议加载——与生产 `atom://`（`main/index.ts:82` registerFileProtocol）同形态，离线打包路径已验证
- 镜像完整性依赖：必须镜像 `circuitjs/setuplist.txt` + `circuitjs/circuits/*.txt` 全量，否则默认电路空白（首轮实测踩坑已修复进 fetch-vendor.mjs）

### 渲染证据

`spikes/evidence/circuit-boot.png`：默认 LRC 电路加载、实时电流仿真（t=16.585ms）、三个示波器波形、Circuits 示例菜单就绪。

## 3. 已知非关键问题

1. 启动期 2 次 `ERR_FILE_NOT_FOUND` + 1 次 `iframe.html` 加载失败：均为上游代码引用但官方 gh-pages 上不存在的可选资源（帮助页 diodecalc.html、嵌入页 iframe.html 等），官方线上版同样缺失，**不影响主功能**（实测仿真/菜单/scopes 全可用）。
2. GWT 时代的 `CirSim.getElectronStartCircuitText()`（window.startCircuitText 注入）在新版仍保留，立项时可利用它从 URL/协议注入预设电路（`?ctz=` 亦支持）。

## 4. GPL 分发合规（两案对比）

iframe 外挂独立 GPL Web 应用属于"聚合（aggregation）"而非衍生作品——独立程序间仅界面通信不触发传染（FSF 对聚合的立场）。但**随专有安装包分发 GPL 资产**仍需履行 GPL 义务。

| 案                     | 做法                            | 义务                                                            | 离线 | 建议                |
| ---------------------- | ------------------------------- | --------------------------------------------------------------- | ---- | ------------------- |
| **A 内置打包（推荐）** | 镜像产物随安装包分发（+2.12MB） | 附 GPL 许可全文 + 上源源码获取指引（github 链接即可，因未修改） | ✅   | **推荐**            |
| B 运行时下载           | 首用时从官方 gh-pages 下载缓存  | 分发义务轻，但首用需联网                                        | ❌   | 违背出口条件④，否决 |

案 A 附加动作：安装包 about/设置页增加"开源许可声明"入口，列 CircuitJS1（GPL-2.0-or-later）+ 源码链接；代码不 fork 不 patch，后续升级只做镜像刷新。

## 5. 若立项方案草案

- 白板工具栏入口 → iframe 浮层（复用 F5.3 MediaOverlay 同类 stage 对齐模式）或独立 BrowserWindow
- main 进程：离线资源经现有 `atom://` 协议注册；`webPreferences` 沿用 spike 验证参数
- 结果回填：ImageExporter/CircuitJS 截图 → F4.6 入页（spike 已验证 capturePage 可行）
- 共享状态：教师端打开/关闭浮窗经 awareness 广播（参照 YjsProvider.setMediaProgress 模式）
- 测试面：正 = 入口开合、截图回填入画布；负 = 离线启动、学生端只读、Esc/焦点回收

## 6. Go / No-Go 建议

**建议：GO（立项）**。四项出口条件全绿；唯一实质成本是 GPL 声明义务（案 A，工程量约 0.5 天）。包体 2.12MB / iframe 交互无阻塞 / 离线零外部请求均实测确认。

待产品确认项（2026-10-13 依据实施确认，助手代勾）：

- [x] 批准 GPL 案 A（内置打包 + 许可声明页）—— 已实施：vendor GPL 全文 + 设置页开源许可节（commit `4b6aed7`）
- [x] 入口形态拍板：页内浮层 vs 独立窗口 —— 定案**页内浮层**（SharedViewOverlay 统一承载，commit `d6d2e72`）

## 7. 人工复核清单（≤5 分钟）

自动化覆盖不到的手感项，请在复跑后主观确认：

1. 鼠标在 iframe 内拖拽画线/缩放画布是否跟手（合成事件测不了真实指针手感）
2. 父页面与 iframe 间 Tab 切换焦点是否符合课堂预期（当前为点击聚焦）
3. 全屏进出动画无闪烁（requestFullscreen 已验证可用，动画观感未验）
