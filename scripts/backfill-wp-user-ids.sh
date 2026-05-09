#!/usr/bin/env bash
# One-shot backfill: link existing Better Auth users to WP authors via wp_user_id.
# Run after deploying federate-post-author against an environment that already has
# Better Auth users predating the post-signup hook.
#
# Reads DB_* and WP_GRAPHQL_{URL,SERVICE_TOKEN} from .env in the repo root.
# Postgres is reached via the docker compose service "postgres".

set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

: "${WP_GRAPHQL_SERVICE_TOKEN:?set WP_GRAPHQL_SERVICE_TOKEN in .env first (see .env.example for the mint command)}"
WP_URL="${WP_GRAPHQL_URL:-http://localhost:8080/graphql}"
PG_CONTAINER="${PG_CONTAINER:-desafio-tecnico-dev-plano-main-postgres-1}"

psql() { docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

updated=0
total=0
while IFS='|' read -r raw_id raw_email; do
  id="$(echo "$raw_id" | xargs)"
  email="$(echo "$raw_email" | xargs)"
  [ -z "$id" ] || [ -z "$email" ] && continue
  total=$((total + 1))

  wp_id="$(curl -sS "$WP_URL" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $WP_GRAPHQL_SERVICE_TOKEN" \
    -d "{\"query\":\"{users(where:{search:\\\"$email\\\",searchColumns:[EMAIL]},first:5){nodes{databaseId email}}}\"}" \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)
nodes = d.get('data', {}).get('users', {}).get('nodes', []) or []
matches = [n for n in nodes if (n.get('email') or '').lower() == '$email'.lower()]
print(matches[0]['databaseId'] if len(matches) == 1 else '')
")"

  if [ -n "$wp_id" ]; then
    psql -c "UPDATE \"user\" SET wp_user_id = $wp_id WHERE id = '$id';" >/dev/null
    echo "  ✓ $email → $wp_id"
    updated=$((updated + 1))
  fi
done < <(psql -t -A -F '|' -c 'SELECT id, email FROM "user" WHERE wp_user_id IS NULL;')

echo "Backfill complete: updated $updated / $total"
