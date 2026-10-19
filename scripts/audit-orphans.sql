-- S9b 孤儿巡检（零外键方案的翻案条件数据源）。
-- 台账：docs/research/system-gap-analysis.md GAP-S9b（批次 5 拍板：11 表不做 FK，巡检孤儿率留痕）；
-- runbook：docs/research/runbooks/orphan-audit.md；证据：docs/research/drills/s9b-index-explain.md。
-- 口径：11 条门禁关系（子→父 NOT EXISTS）全部须为 0；
--       live_rooms.liveUserId → users.id 为观察项（历史用户删除等合法遗留，不设门禁）。
-- 用法：docker exec -i <pg容器> psql -U postgres -d yunyan_live -X -q -f - < scripts/audit-orphans.sql

\echo '[门禁] 11 条关系孤儿计数（期望全 0）'
SELECT relation, orphans FROM (
  SELECT '01 live_participants.roomId→live_rooms'::text AS relation, count(*) AS orphans
  FROM live_participants c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
  UNION ALL
  SELECT '02 user_watch_times.room_id→live_rooms', count(*)
  FROM user_watch_times c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c.room_id)
  UNION ALL
  SELECT '03 chat_messages.room_id→live_rooms', count(*)
  FROM chat_messages c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c.room_id)
  UNION ALL
  SELECT '04 chat_moderation.room_id→live_rooms', count(*)
  FROM chat_moderation c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c.room_id)
  UNION ALL
  SELECT '05 checkin_sessions.roomId→live_rooms', count(*)
  FROM checkin_sessions c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
  UNION ALL
  SELECT '06 checkin_records.sessionId→checkin_sessions', count(*)
  FROM checkin_records c
  WHERE NOT EXISTS (SELECT 1 FROM checkin_sessions p WHERE p.id = c."sessionId")
  UNION ALL
  SELECT '07 board_snapshots.roomId→live_rooms', count(*)
  FROM board_snapshots c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
  UNION ALL
  SELECT '08 board_tool_usage.roomId→live_rooms', count(*)
  FROM board_tool_usage c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
  UNION ALL
  SELECT '09 coursewares.roomId→live_rooms', count(*)
  FROM coursewares c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
  UNION ALL
  SELECT '10 video_recordings.roomId→live_rooms', count(*)
  FROM video_recordings c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
  UNION ALL
  SELECT '11 live_transfer_codes.roomId→live_rooms', count(*)
  FROM live_transfer_codes c
  WHERE NOT EXISTS (SELECT 1 FROM live_rooms p WHERE p."roomId" = c."roomId")
) t
ORDER BY t.relation;

\echo '[观察] live_rooms.liveUserId→users.id（不设门禁；>0 多为历史用户删除遗留）'
SELECT count(*) AS observe_orphans
FROM live_rooms r
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id::text = r."liveUserId");

\echo '门禁小结：期望恰好 11 行且 orphans 全 0；观察项单独评估，不阻断。'
