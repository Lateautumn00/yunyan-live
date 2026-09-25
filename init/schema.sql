-- 云砚直播 (Yunyan Live) 数据库表结构
-- PostgreSQL

-- 1. 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. 直播房间表
CREATE TABLE live_rooms (
  room_id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  join_code VARCHAR(20) NOT NULL UNIQUE,
  type INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  start_time TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  live_user_id VARCHAR(50) NOT NULL,
  live_nums INTEGER NOT NULL DEFAULT 0,
  live_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. 直播参与者表
CREATE TABLE live_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  room_id VARCHAR NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT UQ_live_participants_user_room UNIQUE (user_id, room_id)
);

-- 4. 视频录制表
CREATE TABLE video_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id VARCHAR(50) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  record_type INTEGER NOT NULL DEFAULT 1,
  teacher_name VARCHAR(50) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 用户观看时长表
CREATE TABLE user_watch_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(50) NOT NULL,
  room_id VARCHAR(50) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 直播转让码表
CREATE TABLE live_transfer_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  room_id VARCHAR(50) NOT NULL,
  target_user_id VARCHAR(50) NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
