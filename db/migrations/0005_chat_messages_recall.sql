-- F4 消息撤回（批次 4a）。台账：docs/research/system-gap-analysis.md F4。
-- 存储拍板：撤回保留行——置 recalled_at/recalled_by 留痕，同时置空 content/mentions/extra
-- （原文物理销毁）；历史查询按 recalled_at 返回"已撤回"占位（chat-ws rowToEntry），
-- 离线重连不得再现原文（台账 DoD 三层用例覆盖）。
-- 索引裁决（留痕）：台账原文"IDX_chat_messages_room_time 改部分索引 WHERE recalled_at IS NULL"
-- 与"历史返回已撤回占位"互斥——部分索引会把已撤回行排除出 room_time 索引，keyset 分页退化 seq scan。
-- 拍板：0005 只加列、不改任何索引；撤回 UPDATE 走 uq_chat_messages_msg_id 单行索引
-- （2000 万行 EXPLAIN 证据随批次 4a 回写入台账）。
-- 幂等（SOP：baseline 先应用，本文件在空库上须可跳过已有对象）。
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS recalled_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS recalled_by uuid;
