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
2. LibreOffice（`soffice --headless --convert-to pdf`，超时 120s）转换，直出 `uploads/ppt/<baseName>.pdf`
3. 前端拿到 PDF URL 后用 pdf.js 客户端按页渲染（页数、页尺寸均以 pdf.js 为准，无需逐页图片）

**服务端依赖（Linux）：** `sudo apt install libreoffice-core fonts-noto-cjk`。中文字体（如 `fonts-noto-cjk`）**必需**——缺失时 PDF 中文会渲染成豆腐块（乱码）。**无需 poppler-utils**。

**环境变量：**

- `SOFFICE_PATH`：soffice 可执行文件路径（默认 Windows 为
  `C:\Program Files\LibreOffice\program\soffice.exe`，其他平台从 `PATH` 查找 `soffice`；
  Ubuntu 常见为 `/usr/bin/libreoffice`）

**失败行为：** 转换失败（工具缺失/超时/无输出）时响应结构不变，`fileUrl` 为空字符串；
日志记录 `LibreOffice 转 PDF` 阶段错误，`ENOENT` 时附安装提示。前端检测到空 `fileUrl` 时提示「PPT上传失败」。

**响应 data：**

| 字段    | 类型   | 说明                                                                                 |
| ------- | ------ | ------------------------------------------------------------------------------------ |
| fileUrl | string | PDF 文件 URL，如 `http://localhost:3001/uploads/ppt/<baseName>.pdf`（失败时为 `""`） |

**示例：**

```json
{
  "code": 1000,
  "msg": "success",
  "data": { "fileUrl": "http://localhost:3001/uploads/ppt/1727000000000-123456789.pdf" }
}
```
