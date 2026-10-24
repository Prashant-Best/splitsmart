#!/usr/bin/env bash
# End-to-end check of a running stack through the nginx front door (used by CI):
# sign up, create a group, add an expense (a MongoDB transaction on a real replica set),
# and confirm the balances are consistent and sum to zero.
#
#   scripts/smoke-test.sh [base-url]        default http://localhost:8080
set -euo pipefail

BASE="${1:-http://localhost:8080}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT
json=(-H 'Content-Type: application/json')

curl -fsS "$BASE/api/health" | jq -e '.status == "ok"' >/dev/null
curl -fsS "$BASE/" | grep -q '<div id="root">'
curl -fsS "$BASE/groups/does-not-matter" | grep -q '<div id="root">' # SPA fallback

EMAIL="smoke-$(date +%s)@example.com"
curl -fsS -c "$JAR" "${json[@]}" -d "{\"name\":\"Smoke Test\",\"email\":\"$EMAIL\",\"password\":\"smoke-test-password\"}" \
  "$BASE/api/auth/register" >/dev/null
USER_ID=$(curl -fsS -b "$JAR" "$BASE/api/auth/me" | jq -r '.user.id')
GROUP_ID=$(curl -fsS -b "$JAR" "${json[@]}" -d '{"name":"CI group"}' "$BASE/api/groups" | jq -r '.group.id')

curl -fsS -b "$JAR" "${json[@]}" "$BASE/api/groups/$GROUP_ID/expenses" -d @- >/dev/null <<EOF
{"description":"Smoke test dinner","amount":10000,"category":"food","date":"$(date +%F)",
 "payers":[{"user":"$USER_ID","amount":10000}],
 "split":{"type":"equal","participants":["$USER_ID"]}}
EOF

curl -fsS -b "$JAR" "$BASE/api/groups/$GROUP_ID/balances" |
  jq -e '.consistent == true and .total == 0' >/dev/null
curl -fsS -b "$JAR" "$BASE/api/groups/$GROUP_ID/expenses" | jq -e '.items | length == 1' >/dev/null

echo "Smoke test passed against $BASE"
