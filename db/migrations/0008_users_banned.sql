-- 批次 7 / GAP-F8：用户封禁状态（admin-service 管理）。
-- 拍板（封禁三语义）：
--   1. 禁登录：users.banned_at IS NOT NULL 时，auth-service Login 直接拒绝（登录前查）。
--   2. 踢在线会话：admin-service BanUser 经 gateway 调 SessionService.revokeAllSessions（WS 侧经 session:kick 频道踢掉在线连接）。
--   3. 进行中直播不中断：封禁只影响"登录/新建房间"，已加入的进行中直播允许看完（不粗暴断流）；直播间的踢人是另一语义（ModerateUser kick，已存在）。
-- 列名沿现网 camelCase 引号习惯；零外键（banned_by 存 admin id 字符串，不建 FK）。
-- 幂等（SOP：baseline 先应用，本文件在空库上须可跳过已有对象）。
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS banned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS banned_by character varying(50);

CREATE INDEX IF NOT EXISTS idx_users_banned_at
  ON users USING btree (banned_at) WHERE banned_at IS NOT NULL;
