-- 批次 7 / GAP-F8 翻案：独立管理后台，admins 表与 users 完全解耦（用户拍板）。
-- 管理员账号不复用 users.role（1=teacher/2=student）与 RSA 加密链路；独立字段/独立鉴权 audience。
-- role 值域与 users.role 物理隔离：1=超管(admin) / 2=运营(operator)，不与 1/2 语义冲突。
-- 列名沿现网 camelCase 引号习惯；零外键（沿用 11 表零外键拍板，与 users 无关系）。
-- 幂等（SOP：baseline 是全链快照先应用，本文件在空库上须可跳过已有对象）。
CREATE TABLE IF NOT EXISTS admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(200),
    password_hash character varying(255) NOT NULL,
    role smallint NOT NULL DEFAULT 1,
    status character varying(20) NOT NULL DEFAULT 'active',
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admins_pkey PRIMARY KEY (id),
    CONSTRAINT admins_username_key UNIQUE (username),
    -- OR 形态（非 IN）：IN 数组字面量 deparse 跨库形态不稳，会让 baseline diff 门禁假红（同 chat_moderation 注释）。
    CONSTRAINT admins_role_check CHECK (role = 1 OR role = 2),
    CONSTRAINT admins_status_check CHECK (status = 'active' OR status = 'disabled')
);

CREATE INDEX IF NOT EXISTS idx_admins_role
  ON admins USING btree (role);

CREATE INDEX IF NOT EXISTS idx_admins_status
  ON admins USING btree (status);
