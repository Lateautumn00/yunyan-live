BEGIN;
CREATE TABLE IF NOT EXISTS checkin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roomId" VARCHAR(50) NOT NULL,
  "teacherId" VARCHAR(50) NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "deadlineAt" TIMESTAMPTZ NOT NULL,
  "endedAt" TIMESTAMPTZ,
  "attendeeIds" JSONB NOT NULL,
  "attendeeCount" INTEGER NOT NULL DEFAULT 0,
  "makeupOpen" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS IDX_checkin_sessions_room_started
  ON checkin_sessions ("roomId", "startedAt" DESC);

CREATE TABLE IF NOT EXISTS checkin_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL,
  "userId" VARCHAR(50) NOT NULL,
  "respondedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT UQ_checkin_records_session_user UNIQUE ("sessionId", "userId")
);
COMMIT;
