# Stage-4 Spike 装置（F3.4 电路仿真 / F3.5 分子查看）

可复跑实测装置，配套报告：

- `docs/research/spike-f3.4-circuit.md`
- `docs/research/spike-f3.5-molecule.md`

## 目录

- `fetch-vendor.mjs` — 下载三方候选到 `vendor/`（**gitignored**），打印字节数 + sha256
- `circuit/harness.html` — F3.4：sandbox iframe 加载 CircuitJS1，等待 GWT canvas 就绪
- `molecule/harness.html` — F3.5：3Dmol.js 渲染 1CRN.pdb（cartoon + VDW surface），canvas 非空校验 + 旋转重绘校验
- `run-spike.mjs` — Electron main：`spike://` 自定义协议（对应生产 `atom://` 形态）、离线请求计数、iframe 焦点/键盘/全屏、内存、截图
- `evidence/` — 实测产物（results.json + 截图），入库

## 复跑

```bash
node spikes/fetch-vendor.mjs
& ".\apps\desktop\node_modules\electron\dist\electron.exe" ".\spikes\run-spike.mjs"
```

结果写入 `spikes/evidence/results.json` 并打印到 stdout。

## 约束

- 三方库不入库：`vendor/` 在 .gitignore，报告以 sha256 + 字节数记录
- Electron runner 与 desktop 主应用隔离（webPreferences 与生产一致：sandbox + contextIsolation + 无 nodeIntegration）
