-- S12 审计日志表（批次 4a）。
-- 台账：docs/research/system-gap-analysis.md S12；保留策略：docs/research/data-retention-policy.md。
-- 分区预留复核点：PK (id, occurred_at) 复合 = 未来 PARTITION BY RANGE (occurred_at) 所需的分区键形态，
-- 转分区不重建键；届时 event_id 唯一约束需补含分区键（消费侧 ON CONFLICT 不带冲突目标，转换不改写入语义）。
-- 追加即不可变：行级触发器禁 UPDATE/DELETE；保留期删除走未来分区 DROP（不触发行触发器）；
-- TRUNCATE 不触发行级触发器（测试清场仍可用）。
-- 幂等（SOP：baseline 是全链快照先应用，本文件在空库上须可跳过已有对象）。
CREATE TABLE IF NOT EXISTS audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid NOT NULL,
    actor character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    target_type character varying(50),
    target_id character varying(100),
    request_id character varying(64),
    ip character varying(45),
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id, occurred_at),
    CONSTRAINT audit_logs_event_id_key UNIQUE (event_id)
);

CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only (S12): % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
