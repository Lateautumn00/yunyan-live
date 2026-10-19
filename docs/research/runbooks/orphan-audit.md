# 孤儿巡检 Runbook（GAP-S9b，零外键方案的翻案条件数据源）

台账拍板（批次 5）：11 张业务表**不做外键**；翻案条件 = 巡检出孤儿率数据。
本 runbook 定义巡检口径、节奏、处置与翻案触发。

## 命令

```bash
# 手动（容器名按部署环境，compose 默认 yunyan-live-postgres）
docker exec -i yunyan-live-postgres psql -U postgres -d yunyan_live -X -q -f - \
  < scripts/audit-orphans.sql

# 定时（部署机 cron，建议每日 03:30，排在 03:00 日备之后；日志落盘留痕）
# 30 3 * * * docker exec -i yunyan-live-postgres psql -U postgres -d yunyan_live -X -q -f - \
#   < /opt/yunyan-live/scripts/audit-orphans.sql >> /var/log/yunyan-live/orphan-audit.log 2>&1
```

演练入口：`scripts/drill-s9b-explain.sh` 第 5 步（种 3 孤儿 → 检出 → 清理 → 归零），
证据：`docs/research/drills/s9b-index-explain.md`。

## 期望输出与判读

- **[门禁] 11 条关系**：期望恰好 11 行且 `orphans` 全 0。任何一行 > 0 即进入下方处置。
- **[观察] live_rooms.liveUserId→users.id**：不设门禁。>0 多为历史用户删除遗留，
  仅观察趋势（drill 环境未造 users，该值非零属预期）。

## 处置步骤（门禁检出 > 0）

1. **定位来源**：对检出关系单独跑带子表字段的 SELECT（id/时间列），看孤儿产生时间与写入路径。
2. **先清后修**：孤儿行按业务可恢复性处理——能补父行则补，否则删除子行（保留删除语句留痕）；
   重跑巡检至全 0。
3. **堵写入口**：排查产生孤儿的写路径（应用层缺父校验），补代码级校验；
   若同关系 30 天内复现 ≥ 2 次 → 触发翻案。
4. **留痕**：处置记录（日期/关系/行数/根因/修复提交）追加到本文件「巡检留痕」节。

## 翻案条件（何时重新评估加 FK）

满足任一即回评 FK 方案（`NOT VALID` 起步 + 分批 `VALIDATE`，不阻断现网写入）：

- 任一门禁关系 30 天内复现孤儿 ≥ 2 次；
- 单次检出孤儿 > 100 行（量级异常，说明写路径系统性失守）；
- 产品引入新的强一致依赖（如删除房间须级联强约束）。

## 巡检留痕

| 日期       | 关系               | 孤儿数    | 根因 | 处置                                          |
| ---------- | ------------------ | --------- | ---- | --------------------------------------------- |
| 2026-10-19 | 演练自检（非生产） | 种3检3清0 | —    | `drill-s9b-explain.sh` step5 PASS，见演练记录 |
