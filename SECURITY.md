# 安全政策

## 支持的版本

本项目目前以 `main` 分支为唯一受支持版本，尚未发布版本化安全补丁。

| 版本     | 支持状态  |
| -------- | --------- |
| `main`   | ✅ 支持   |
| < `main` | ❌ 不支持 |

## 报告漏洞

请**不要**通过公开 Issue 报告安全漏洞。请使用 GitHub 私密渠道：

**[GitHub Security Advisories → Report a vulnerability](https://github.com/Lateautumn00/yunyan-live/security/advisories/new)**

如果该渠道不可用，可通过 GitHub 私信联系维护者。

报告时请尽量包含：

- 漏洞类型（如 XSS、SQL 注入、JWT 绕过、越权访问、依赖漏洞）
- 受影响的模块（`apps/*` 或 `packages/*`）与文件路径
- 可复现步骤或最小复现用例
- 影响评估（攻击前提、数据/权限影响）
- 已知的修复建议（如有）

## 处理流程

1. **确认** — 72 小时内确认收到并初步评估
2. **修复** — 评估优先级后开发修复，必要时协调披露时间
3. **披露** — 修复合并后发布 [Security Advisory](https://github.com/Lateautumn00/yunyan-live/security/advisories)，公开致谢（除非你要求匿名）

## 配置安全提示

部署前务必修改以下默认值，否则会构成安全风险：

- 各服务 `.env` 中的 `JWT_SECRET`（切勿使用示例值）
- `init/docker-compose.yml` 中的 `POSTGRES_PASSWORD`
- `init/entrypoint.sh` 中的 Janus `admin_secret` / `token_auth_secret`
- 数据库与 Redis 端口（`5432` / `6379`）的对外暴露范围
- `init/.env` 中的 `RABBITMQ_USER` / `RABBITMQ_PASSWORD`（compose 经 `${RABBITMQ_USER:?}` 插值，示例文件不含真实口令；管理台 `15672` 仅绑定 `127.0.0.1`）
- 邮件服务的 SMTP 授权码

`.env` 文件已由 `.gitignore` 排除，**禁止**将真实凭据提交到仓库。
