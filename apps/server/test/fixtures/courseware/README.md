# 课件转换保真样例集（F5.4）

用于 `src/upload/courseware-fidelity.spec.ts` 的转换保真基线。**二进制样例本体不入库**（单个 < 2MB、总量 < 20MB，实施环境就绪后按本 README 构造并本地放置；`.gitignore` 已忽略 `*.pptx`）。

## 分类（每类 1-2 个，合成构造优先，避免真实课件版权）

| id                | 覆盖保真损失          | 构造要点                                     |
| ----------------- | --------------------- | -------------------------------------------- |
| font-missing      | 字体替换              | 指定转换机不存在的小众字体文本框             |
| font-installed    | 字体（对照）          | 同内容改用思源黑体/Noto（部署机必装）        |
| master-complex    | 母版/主题             | 多层背景 + 斜切装饰 + 渐变标题               |
| smartart          | SmartArt              | 层级图、循环图各一页                         |
| formula-dense     | 公式                  | 多行 OMML 公式混排一页                       |
| chart-embedded    | 嵌入图表              | 嵌入 Excel 柱状/折线各一页                   |

## manifest.json 格式

```json
{
  "cases": [
    { "id": "font-missing", "file": "font-missing.pptx", "note": "小众字体文本框" }
  ]
}
```

## 基线（baseline.json）

由首次成功转换生成并人工复核后回填：

```json
{
  "loVersion": "24.2",
  "entries": [
    { "caseId": "font-missing", "pageCount": 2, "perceptualHashes": ["<64bit-hex>", "<64bit-hex>"] }
  ]
}
```

- `pageCount`：硬断言（不一致 → fail）。
- `perceptualHashes`：每页渲染 PNG 的感知哈希（64bit hex）；偏差超阈仅 warn，走人工复核。

## 跑法（本机需 soffice，见 docs/apis/server/upload.md 部署段）

```bash
COURSEWARE_FIDELITY=1 pnpm --filter @yunyan-live/server test
```

未设 `COURSEWARE_FIDELITY` 时转换套件全 skip，CI 零负担。

## 转换与比对步骤（实施时补全断言）

1. 对每个 case 跑 `buildPptToPdfArgs` + soffice（复用 controller 同参）。
2. 校验产物存在且非 0 字节；用 pdf 工具取页数（与 manifest 预期页数对照）。
3. 每页渲染 PNG → 感知哈希 → `compareFidelityBaseline(baseline, current)`。
4. `fail` 使测试失败；`warn` 打印 reasons 并通过（人工复核入口）。
5. LO 大版本升级时全量重跑并回填基线。
