-- F1 附带：白板工具使用埋点（F12 触发条件的最小前置——导图等工具使用数据由此供给）。
-- 列名沿现网 camelCase 引号习惯（照 board_snapshots）；无 FK（房间软删语义由查询侧过滤）。
-- 幂等（SOP：baseline 是全链快照先应用，本文件在空库上须可跳过已有对象；现网 --baseline 登记后本文件才真执行）。
CREATE TABLE IF NOT EXISTS board_tool_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "roomId" character varying(50) NOT NULL,
    "userId" character varying(50) NOT NULL,
    tool character varying(40) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT board_tool_usage_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_board_tool_usage_room_created
  ON board_tool_usage USING btree ("roomId", "createdAt");
