# 上传接口 `/upload`

控制器：`apps/server/src/upload/upload.controller.ts`。

两个接口均为 `multipart/form-data`，字段名 `file`。无需鉴权。上传文件存于 Gateway 进程工作目录的 `uploads/`，并通过 `/uploads` 前缀静态暴露。

## 1. 上传图片

`POST /upload/image`

**请求体（multipart）：**

| 字段 | 类型 | 说明                |
| ---- | ---- | ------------------- |
| file | file | 图片文件，限制 10MB |

**格式限制：** 仅 `jpg / jpeg / png / gif / bmp`（按 mimetype 判断），否则返回 400「仅支持图片格式 (jpg/png/gif/bmp)」。

**响应 data：**

| 字段    | 类型   | 说明                                                                      |
| ------- | ------ | ------------------------------------------------------------------------- |
| fileUrl | string | 完整可访问 URL，如 `http://localhost:3001/uploads/images/1727xxx-xxx.jpg` |

**示例：**

```json
{
  "code": 1000,
  "msg": "success",
  "data": { "fileUrl": "http://localhost:3001/uploads/images/1727000000000-123456789.jpg" }
}
```

## 2. 上传 PPT 并转为 PDF

`POST /upload/ppt`

**请求体（multipart）：**

| 字段 | 类型 | 说明                |
| ---- | ---- | ------------------- |
| file | file | PPT 文件，限制 50MB |

**格式限制：** 仅 `.ppt` / `.pptx`（按原始文件名后缀），否则返回 400「仅支持 .ppt 和 .pptx 格式」。

**处理流程：**

1. 保存原始 PPT 到 `uploads/ppt/<baseName>.pptx`
2. LibreOffice 转换为 PDF（`pdf:impress_pdf_Export` 保真参数 + headless 硬化参数，超时 120s），直出 `uploads/ppt/<baseName>.pdf`；产物缺失或 0 字节均判失败
3. 前端拿到 PDF URL 后用 pdf.js 客户端按页渲染（页数、页尺寸均以 pdf.js 为准，无需逐页图片）

**转换参数（F5.4 保真调优）：** `buildPptToPdfArgs`（`src/upload/ppt-convert.ts`）使用 `pdf:impress_pdf_Export` FilterOptions：无损压缩嵌入图（`UseLosslessCompression=true`）、JPEG 质量 90、不降分辨率（`ReduceImageResolution=false`），并附 `--norestore --nolockcheck --nodefault --nofirststartwizard` 减少并发/残留锁风险。

**服务端依赖（Linux）：** `sudo apt install libreoffice-impress fonts-noto-cjk`（**必须是 `libreoffice-impress` 而非 `libreoffice-core`**——core-only 安装缺 Impress 导入过滤器 `libsdlo.so`，任何 ppt 都会报 `source file could not be loaded`）。中文字体（如 `fonts-noto-cjk`）**必需**——缺失时 PDF 中文会渲染成豆腐块（乱码）。生产转换链路无需 poppler；**保真样例集回归**（`COURSEWARE_FIDELITY=1`，见 `apps/server/test/fixtures/courseware/README.md`）另需 `poppler-utils`（pdfinfo/pdftoppm）。

**字体部署（F5.4，保真第一损失点）：**

- Linux 容器最小集：`fonts-noto-cjk`（思源黑体/Noto CJK）+ `fonts-liberation`（西文度量兼容）；安装后执行 `fc-cache -f` 刷新 fontconfig 缓存（冷启动时序注意）。
- Windows 部署：转换机需可访问课件常用字体（系统字体目录默认可见）；课件指定的小众字体仍会近似替换——属预期，不承诺保真。
- LibreOffice 版本锁定 24.x LTS；升级前须跑转换样例集回归（见 `apps/server/test/fixtures/courseware/README.md`，`COURSEWARE_FIDELITY=1`）。
- 商业/教育字库的采购与授权边界不在本文档范围，实施时单独确认。

**环境变量：**

- `SOFFICE_PATH`：soffice 可执行文件路径（默认 Windows 为
  `C:\Program Files\LibreOffice\program\soffice.exe`，其他平台从 `PATH` 查找 `soffice`；
  Ubuntu 常见为 `/usr/bin/libreoffice`）

**失败行为（F5.4 结构化降级）：** 转换失败时 HTTP 200、信封不变，`data.fileUrl` 为空字符串，同时附带判别对象 `data.convertError`：

| 字段        | 类型    | 说明                                                                                                                 |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| stage       | string  | `soffice-missing`（转换器缺失，不可重试）/ `convert`（转换失败/超时，可重试）/ `missing-pdf`（无有效产物，不可重试） |
| retryable   | boolean | 前端是否展示"重试"倾向（超时与一般转换失败为 true）                                                                  |
| message     | string  | 可直接展示的失败描述                                                                                                 |
| originalUrl | string  | 已落盘原 PPT 的静态地址（`/uploads/ppt/<baseName>.pptx`），供前端下载兜底                                            |

旧版前端（只检查空 `fileUrl`）行为不变，仍提示「PPT上传失败」；新版 desktop 识别 `convertError` 后展示具体文案，`originalUrl` 非空时提供"打开原文件"入口（`CoursewareUpload.vue` 弹确认框、房内 `WhiteBoard.vue` toast 指引）。超时保持 120s（`PPT_TO_PDF_TIMEOUT_MS`）。

**响应 data：**

| 字段         | 类型   | 说明                                                                                 |
| ------------ | ------ | ------------------------------------------------------------------------------------ |
| fileUrl      | string | PDF 文件 URL，如 `http://localhost:3001/uploads/ppt/<baseName>.pdf`（失败时为 `""`） |
| convertError | object | 仅失败时出现，结构见上表                                                             |

**成功示例：**

```json
{
  "code": 1000,
  "msg": "success",
  "data": { "fileUrl": "http://localhost:3001/uploads/ppt/1727000000000-123456789.pdf" }
}
```

**失败示例：**

```json
{
  "code": 1000,
  "msg": "success",
  "data": {
    "fileUrl": "",
    "convertError": {
      "stage": "soffice-missing",
      "retryable": false,
      "message": "未找到 LibreOffice 转换器，请安装或配置 SOFFICE_PATH",
      "originalUrl": "http://localhost:3001/uploads/ppt/1727000000000-123456789.pptx"
    }
  }
}
```
