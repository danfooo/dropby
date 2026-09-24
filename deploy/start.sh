#!/bin/sh
# Container entrypoint. Without LITESTREAM_REPLICA_URL the server starts exactly as
# before. With it, a missing database (e.g. a fresh volume) is first restored from the
# replica, and Litestream then runs the server as its child, streaming every change.
set -e

DB=/app/server/data/drop-by.db
CONFIG=/app/deploy/litestream.yml

if [ -n "$LITESTREAM_REPLICA_URL" ]; then
  mkdir -p "$(dirname "$DB")"
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$DB"
  exec litestream replicate -config "$CONFIG" -exec "node dist/index.js"
fi

exec node dist/index.js
