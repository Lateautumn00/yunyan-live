-- F3 单用户禁言/踢出状态（批次 4a）。台账：docs/research/system-gap-analysis.md F3。
-- 存储拍板：PG 落库（跨重启一致；重启语义=状态保留，与 data-retention-policy.md 一致）。
-- 语义：kind=mute（until=到期时间，1/5/10 分钟）| kick（until=NULL，绑 roomId=本场，
-- 房间行即场次——新场次=新 roomId，天然"禁止本场重进"）；active=false 表示已解除/已到期。
-- 部分唯一索引保证每 (room,user,kind) 至多一条 active 行；写路径先 deactivate 再 insert。
-- 幂等（SOP：baseline 先应用，本文件在空库上须可跳过已有对象）。
CREATE TABLE IF NOT EXISTS chat_moderation (
    id bigint GENERATED ALWAYS AS IDENTITY,
    room_id character varying(50) NOT NULL,
    user_id character varying(50) NOT NULL,
    kind character varying(10) NOT NULL,
    until timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(50) NOT NULL,
    released_at timestamp with time zone,
    released_reason character varying(30),
    CONSTRAINT chat_moderation_pkey PRIMARY KEY (id),
    -- OR 形态（非 IN）：IN 的数组字面量 deparse 跨库形态不稳（varchar[]/text[] 两解），
    -- 会让 baseline diff 门禁假红；OR-of-EQ 无数组强制，pg_dump 输出确定。
    CONSTRAINT chat_moderation_kind_check CHECK (kind = 'mute' OR kind = 'kick')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_moderation_active
  ON chat_moderation (room_id, user_id, kind) WHERE active;

CREATE INDEX IF NOT EXISTS idx_chat_moderation_room_user_active
  ON chat_moderation (room_id, user_id) WHERE active;
