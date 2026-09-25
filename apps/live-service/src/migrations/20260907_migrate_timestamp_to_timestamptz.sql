-- Migrate timestamp (without timezone) to timestamptz (with timezone)
-- Assumes existing data is in Beijing time (UTC+8).
-- AT TIME ZONE '+08:00' tells PostgreSQL to treat the existing values as Beijing time
-- and convert them to UTC for storage in timestamptz.

-- video_recordings
ALTER TABLE video_recordings
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE '+08:00';
ALTER TABLE video_recordings
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE '+08:00';

-- live_rooms
ALTER TABLE live_rooms
  ALTER COLUMN start_time TYPE timestamptz USING start_time AT TIME ZONE '+08:00';
ALTER TABLE live_rooms
  ALTER COLUMN live_started_at TYPE timestamptz USING live_started_at AT TIME ZONE '+08:00';
ALTER TABLE live_rooms
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE '+08:00';
ALTER TABLE live_rooms
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE '+08:00';
ALTER TABLE live_rooms
  ALTER COLUMN deleted_at TYPE timestamptz USING deleted_at AT TIME ZONE '+08:00';

-- live_participants
ALTER TABLE live_participants
  ALTER COLUMN joined_at TYPE timestamptz USING joined_at AT TIME ZONE '+08:00';

-- live_transfer_codes
ALTER TABLE live_transfer_codes
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE '+08:00';
ALTER TABLE live_transfer_codes
  ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE '+08:00';
