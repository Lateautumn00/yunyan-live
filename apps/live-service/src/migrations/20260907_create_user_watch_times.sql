CREATE TABLE user_watch_times (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(50) NOT NULL,
  room_id       VARCHAR(50) NOT NULL,
  joined_at     TIMESTAMPTZ NOT NULL,
  left_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_watch_times_room_id ON user_watch_times(room_id);
CREATE INDEX idx_user_watch_times_user_id ON user_watch_times(user_id);
