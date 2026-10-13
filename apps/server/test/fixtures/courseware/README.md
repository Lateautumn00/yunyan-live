# 课件转换保真样例集（F5.4）

用于 `src/upload/courseware-fidelity.spec.ts` 的转换保真基线。**二进制样例与 manifest 本体不入库**（`.gitignore` 已忽略 `*.pptx` 与 `manifest.json`，均可由生成器确定性重建）；`baseline.json` 经人工复核后入库。

## 生成样例（任意装有 Node + jszip 的机器）

```bash
node apps/server/scripts/generate-courseware-fixtures.mjs
# 或指定输出目录：node ... --out <dir>
```

脚本手写最小 OOXML（零外部办公套件依赖）生成六类 PPTX + `manifest.json`。转换套件跑起来时若 `manifest.json` 缺失也会自动调用生成器。

## 分类（每类 1-2 页，合成构造，无真实课件版权）

| id                | 覆盖保真损失 | 构造要点                                            |
| ----------------- | ------------ | --------------------------------------------------- |
| font-missing      | 字体替换     | 方正兰亭（FZLanTingHei-R-GBK）文本框，转换机必缺    |
| font-installed    | 字体（对照） | 同内容改用 Noto Sans CJK SC（部署机必装）           |
| master-complex    | 母版/主题    | 多层背景 + 斜切装饰 + 渐变标题 ×2 页                |
| smartart          | SmartArt     | 层级图、循环图各一页（图形组合近似 SmartArt 结构）  |
| formula-dense     | 公式         | 8 行 OMML 公式混排一页                              |
| chart-embedded    | 嵌入图表     | 真实 chart part + 嵌入 xlsx：柱状/折线各一页        |

## manifest.json 格式

```json
{
  "cases": [
    {
      "id": "font-missing",
      "file": "font-missing.pptx",
      "expectedPages": 1,
      "note": "小众字体文本框，触发字体替换"
    }
  ]
}
```

- `expectedPages`：runner 用 `pdfinfo` 做页数硬断言（不一致 → fail）。

## 基线（baseline.json）

由 `FIDELITY_WRITE_BASELINE=1` 首跑生成，**人工复核后回填入库**：

```json
{
  "loVersion": "LibreOffice 24.2.x",
  "entries": [
    { "caseId": "font-missing", "pageCount": 1, "perceptualHashes": ["<16-hex dhash>", "..."] }
  ]
}
```

- `pageCount`：硬断言。
- `perceptualHashes`：每页 `pdftoppm -r 32` 渲染 PPM → `dhashFromPpm`（64bit dHash，16 hex）；与基线偏差 >10% bit 仅 warn，走人工复核。
- `loVersion`：记录生成基线的 LO 版本；大版本升级须全量重跑并重审基线。

## 跑法（保真回归需 LO 虚拟机 / 部署机）

```bash
# 1. 依赖（Debian/Ubuntu；注意是 libreoffice-impress，仅装 core 无 .pptx 过滤器）
sudo apt install libreoffice-impress fonts-noto-cjk poppler-utils

# 2. 生成样例（若 manifest.json 缺失，套件也会自动调）
node apps/server/scripts/generate-courseware-fixtures.mjs

# 3a. 首次生成基线（人工复核 baseline.json 后入库）
FIDELITY_WRITE_BASELINE=1 COURSEWARE_FIDELITY=1 pnpm --filter @yunyan-live/server test

# 3b. 日常回归（读取 baseline.json 比对）
COURSEWARE_FIDELITY=1 pnpm --filter @yunyan-live/server test
```

- soffice 路径非默认时用 `SOFFICE_PATH=/path/to/soffice` 指定。若机器上 `soffice` 指向不含 Impress 的 `libreoffice-core`（报 `source file could not be loaded`），补装 `libreoffice-impress` 或将 `SOFFICE_PATH` 指向完整安装（如 `/opt/libreoffice26.8/program/soffice`）。
- 未设 `COURSEWARE_FIDELITY` 时转换套件全 skip，CI 零负担（生成器/哈希的单元测试不依赖 LO，CI 常跑）。

## 转换与比对步骤（runner 已实现）

1. 逐 case 跑 `buildPptToPdfArgs` + soffice（与 controller 同参，120s 超时）。
2. 产物 `%PDF-` 魔数 + 非空；`pdfinfo` 页数与 `expectedPages` 硬断言。
3. `pdftoppm -r 32` 每页渲染 PPM → `dhashFromPpm` → `compareFidelityBaseline(baseline, current)`。
4. `fail` 使测试失败；`warn` 打印 reasons 并通过（人工复核入口）。
5. LO 大版本升级时全量重跑并回填基线。
