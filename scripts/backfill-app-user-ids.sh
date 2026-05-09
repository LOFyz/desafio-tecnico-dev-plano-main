#!/usr/bin/env bash
# One-shot backfill: write app_user_id user-meta on WP users that match an
# already-linked Better Auth user. Run after deploying enforce-pure-federation
# against an environment that already has app_users rows with wp_user_id set
# but no app_user_id meta on the corresponding WP user.
#
# Sibling of backfill-wp-user-ids.sh; reverse direction (Postgres → WP).
#
# Reads DB_*, WP_GRAPHQL_URL, WP_GRAPHQL_SERVICE_TOKEN from .env at repo root.
# Postgres is reached via the docker compose service "postgres".

set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

: "${WP_GRAPHQL_SERVICE_TOKEN:?set WP_GRAPHQL_SERVICE_TOKEN in .env first}"
WP_BASE="${WP_GRAPHQL_URL:-http://localhost:8080/graphql}"
# Strip /graphql suffix to get the WP root for the REST endpoint.
WP_ROOT="${WP_BASE%/graphql}"
LINK_URL="$WP_ROOT/wp-json/desafio/v1/link-app-user"
PG_CONTAINER="${PG_CONTAINER:-desafio-tecnico-dev-plano-main-postgres-1}"

psql() { docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

linked=0
failures=0
total=0

while IFS='|' read -r raw_id raw_email; do
  id="$(echo "$raw_id" | xargs)"
  email="$(echo "$raw_email" | xargs)"
  [ -z "$id" ] || [ -z "$email" ] && continue
  total=$((total + 1))

  http_code=$(curl -sS -o /tmp/backfill-link.body -w '%{http_code}' \
    -X POST "$LINK_URL" \
    -H 'content-type: application/json' \
    -H "Authorization: Bearer $WP_GRAPHQL_SERVICE_TOKEN" \
    -d "{\"email\":\"$email\",\"app_user_id\":\"$id\"}")

  if [ "$http_code" = "200" ]; then
    echo "  ✓ $email → app_user_id=$id"
    linked=$((linked + 1))
  else
    body=$(cat /tmp/backfill-link.body 2>/dev/null || echo '<no body>')
    echo "  ✗ $email (HTTP $http_code): $body"
    failures=$((failures + 1))
  fi
done < <(psql -t -A -F '|' -c 'SELECT id, email FROM "user" WHERE wp_user_id IS NOT NULL;')

rm -f /tmp/backfill-link.body
echo "Linked $linked users ($failures failures, $total candidates)"
