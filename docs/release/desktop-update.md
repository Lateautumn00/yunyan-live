# 桌面端（Windows）自动更新发版手册

更新机制：`electron-updater` + `electron-builder` generic provider。

- 更新源地址唯一真源：`apps/desktop/electron-builder.yml` 的 `publish.url`（打包时写入安装包 `resources/app-update.yml`）。
- 客户端启动时静默检查；发现新版本弹窗提示，用户确认后下载，下载完成后点击「重启安装」（或退出应用时兜底自动安装）。
- 设置页「软件更新」提供手动检查、当前版本号展示与更新操作。

## 一、发版前检查（仅需一次）

1. `apps/desktop/electron-builder.yml` 已配置真实更新目录地址（按平台），**必须以 `/` 结尾**：

   | 平台  | 更新源地址                    |
   | ----- | ----------------------------- |
   | win   | `http://192.168.2.100/win/`   |
   | mac   | `http://192.168.2.100/mac/`   |
   | linux | `http://192.168.2.100/linux/` |

   ```yaml
   publish: # 顶层默认 = Windows（NSIS 主发布通道）
     provider: generic
     url: http://192.168.2.100/win/
   ```

2. 更新目录是可通过 HTTP(S) 直接访问的静态目录（Nginx 静态站点 / OSS Bucket 均可，当前为局域网 HTTP），客户端会请求：

   - `GET {publish.url}latest.yml`
   - `GET {publish.url}{安装包文件名}`（及差分用 `.blockmap`）

## 二、每次发版步骤

1. **升版本号**：修改 `apps/desktop/package.json` 的 `version`（如 `0.5.0` → `0.5.1`）。
   这是 `latest.yml` 与自动更新比对的唯一版本依据；`.env.production` 的 `VITE_VERSION` 仅作参考展示，同步改一下即可。
2. **打包**（根目录执行）：

   ```bash
   pnpm build:desktop:win
   ```

3. **上传三件套**到 `http://192.168.2.100/win/` 对应的服务器目录（本地产物在 `apps/desktop/dist-release/` 下）：

   | 文件                                   | 说明                                       |
   | -------------------------------------- | ------------------------------------------ |
   | `latest.yml`                           | 更新清单（版本、文件名、sha512），必须上传 |
   | `yunyan-live_setup_x.y.z.exe`          | NSIS 安装包                                |
   | `yunyan-live_setup_x.y.z.exe.blockmap` | 差分更新块映射（不传则回退全量下载）       |

   > Windows NSIS 每次都会重新生成 `latest.yml`，直接用本次产物覆盖旧文件。

4. **验证**：用装有旧版本的机器打开应用，应弹「发现新版本 vX.Y.Z」→ 立即更新 → 进度 → 重启安装；安装后版本号为新版。
   也可在设置页「软件更新」手动检查验证。

## 三、本地联调（不发版）

1. 在 `apps/desktop/` 根目录创建 `dev-app-update.yml`（与 `electron-builder.yml` 的 publish 一致）：

   ```yaml
   provider: generic
   url: http://127.0.0.1:8080/update/win/
   ```

2. 起本地静态服务托管更新目录：

   ```bash
   npx serve dist-release   # 或任意静态服务器，映射到 /update/win/
   ```

3. 打包安装一个低版本（如 0.5.0），升 `version` 后再 `pnpm build:desktop:win`，把三件套放进静态目录。
4. 运行已安装的低版本应用即可走完整更新链路。开发模式（`pnpm dev:desktop`）下无 `dev-app-update.yml` 时检查会报错，
   自动检查静默忽略，设置页手动检查可见错误提示，属预期行为。

## 四、注意事项

- **不要**在 `electron-builder.yml` 配置 `win.publisherName`（当前未签名，配置后更新会因校验失败而中止）。
- `publish.url` 变更后需重新打包安装（`app-update.yml` 内嵌在安装包内）。
- mac/linux 不在本期验证范围（mac 需 Apple 签名与公证才能自动更新）。
- 版本回退无效：`latest.yml` 版本必须单调递增，客户端只升不降。
