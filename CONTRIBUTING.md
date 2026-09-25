# 贡献指南

感谢你对 yunyan-live 的兴趣！本项目是 Electron + Vue 3 + Nest.js + Janus WebRTC 的在线直播教学平台。

## 开发环境

| 依赖    | 版本                                           |
| ------- | ---------------------------------------------- |
| Node.js | >= 24.13.0（见 `.nvmrc`）                      |
| pnpm    | >= 10.28.2（见 `package.json#packageManager`） |
| Docker  | >= 20.10（运行 Janus + PostgreSQL + Redis）    |

```bash
git clone https://github.com/Lateautumn00/yunyan-live.git
cd yunyan-live
pnpm install

# 复制各服务的环境变量模板并按需填写
cp apps/server/.env.example    apps/server/.env
cp apps/desktop/.env.example   apps/desktop/.env.development   # pnpm dev:desktop 使用
cp apps/desktop/.env.example   apps/desktop/.env.production    # pnpm build:desktop 打包时使用
cp init/.env.example           init/.env

# 启动基础设施
cd init && docker compose up -d --build && cd ..

# 后端 + 桌面端
pnpm dev:all
```

详细说明见 [README](README.md)。

## 提交代码前

```bash
pnpm lint         # ESLint
pnpm typecheck    # TypeScript 类型检查
pnpm test         # 单元测试
pnpm format       # Prettier 格式化
```

pre-commit 钩子会自动对暂存文件执行 `eslint --fix` 和 `prettier --write`，
`commit-msg` 钩子会用 commitlint 校验提交信息格式。

## 提交规范

提交信息必须符合 [Conventional Commits](https://www.conventionalcommits.org/)：

```
type(scope): message
```

- **type**: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`
- **scope**: `p0`–`p4` `desktop` `packages` `utils` `validation` `http` `config` `types` `ipc` `deps` `ci` `release`

示例：`fix(desktop): resolve History playback issue`

> 如果钩子拒绝了你的提交，说明提交信息格式或代码风格需要修正。
> 请修正后重新提交，**不要**使用 `--no-verify` 绕过检查。

## Pull Request

1. Fork 仓库并创建分支：`git checkout -b feature/your-feature`
2. 保持提交粒度清晰，每个提交只做一件事
3. 确保 `lint` / `typecheck` / `test` 全部通过
4. 补充或更新测试覆盖你改动的行为
5. 如涉及配置项变更，同步更新 `README.md` 和对应的 `.env.example`
6. 在 PR 描述中说明动机、改动范围与验证方式

## 报告 Bug

请使用 [Issue 模板](https://github.com/Lateautumn00/yunyan-live/issues/new/choose)，
尽量提供：复现步骤、期望行为、实际行为、运行环境（OS / Node / pnpm 版本）与相关日志。

安全漏洞请勿公开提交 Issue，参见 [SECURITY.md](SECURITY.md)。

## 架构速览

- `apps/desktop` — Electron 桌面端（Vue 3 + Element Plus，electron-vite）
- `apps/server` — API 网关（NestJS HTTP + WebSocket）
- `apps/{auth,live,mail}-service` — gRPC 微服务
- `apps/{chat-ws,yjs-ws}-service` — WebSocket 服务（聊天 / 白板）
- `packages/*` — 共享工具包（http / types / utils / validation / ipc / config / shared）
- `init/` — Janus + PostgreSQL + Redis 的 Docker 部署

更多说明见 [docs/apis/](docs/apis/README.md)。
