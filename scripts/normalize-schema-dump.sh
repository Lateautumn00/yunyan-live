#!/usr/bin/env bash
# GAP-S9a: normalize `pg_dump --schema-only` output for stable schema diffing.
# Strips:
#   - \restrict / \unrestrict psql directives (random per-dump token, PG16.15+)
#   - "-- Dumped from database version …" / "-- Dumped by pg_dump version …" headers
#     (client versions may differ between local and CI)
# Trims trailing blank lines.
set -euo pipefail

f="$1"
sed -E -e '/^\\(restrict|unrestrict)/d' -e '/^-- Dumped (from|by) /d' "$f" \
  | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba'
