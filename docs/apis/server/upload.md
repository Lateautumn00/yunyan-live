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

## 2. 上传 PPT 并转为图片

`POST /upload/ppt`

**请求体（multipart）：**

| 字段 | 类型 | 说明                |
| ---- | ---- | ------------------- |
| file | file | PPT 文件，限制 50MB |

**格式限制：** 仅 `.ppt` / `.pptx`（按原始文件名后缀），否则返回 400「仅支持 .ppt 和 .pptx 格式」。

**处理流程：**

1. 保存原始 PPT 到 `uploads/ppt/`
2. LibreOffice（`soffice --headless --convert-to pdf`，超时 120s）转 PDF 到 `uploads/ppt/<baseName>/`
3. `pdftoppm -png -r 150` 将 PDF 逐页转 PNG（超时 120s）——`soffice --convert-to png` 只输出第 1 页，故必须经 PDF 中转
4. PNG 按页码排序并重命名为 `1.png, 2.png, ...`

**服务端依赖（Linux）：** `sudo apt install libreoffice-core poppler-utils fonts-noto-cjk`。中文字体（如 `fonts-noto-cjk`）**必需**——缺失时页图中文会渲染成豆腐块（乱码）。

**环境变量：**

- `SOFFICE_PATH`：soffice 可执行文件路径（默认 Windows 为
  `C:\Program Files\LibreOffice\program\soffice.exe`，其他平台从 `PATH` 查找 `soffice`；
  Ubuntu 常见为 `/usr/bin/libreoffice`）
- `PDFTOPPM_PATH`：pdftoppm 可执行文件路径（默认从 `PATH` 查找）

**失败行为：** 任一阶段失败（工具缺失/超时/无输出）时响应结构不变，`totalNumber` 为 `0`；
日志按阶段（`LibreOffice 转 PDF` / `pdftoppm 转 PNG`）记录错误，`ENOENT` 时附安装提示。

**响应 data：**

| 字段        | 类型   | 说明                                                             |
| ----------- | ------ | ---------------------------------------------------------------- |
| totalNumber | number | 转换出的 PNG 页数（转换失败时为 0）                              |
| fileUrl     | string | 图片目录 URL，如 `http://localhost:3001/uploads/ppt/<baseName>/` |

**示例：**

```json
{
  "code": 1000,
  "msg": "success",
  "data": {
    "totalNumber": 12,
    "fileUrl": "http://localhost:3001/uploads/ppt/1727000000000-123456789/"
  }
}
```
