#!/usr/bin/env bash
set -euo pipefail

for i in {1..30}; do
  if alembic upgrade head; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[backend_start] alembic failed after 30 attempts" >&2
    exit 1
  fi
  echo "[backend_start] waiting for database... ($i/30)"
  sleep 2
done

python -m app.db_init
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
