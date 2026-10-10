#!/bin/sh
# Checks a running deployment: the app loads, the API answers, and an emailed
# sign-in link (read from the API log) gives a working session.
#   deploy/smoke.sh [http://localhost:8080]
set -eu
base=${1:-http://localhost:8080}
here=$(cd "$(dirname "$0")" && pwd)
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT

echo "app:    $(curl -fsS "$base/" | grep -o '<title>[^<]*</title>')"
echo "health: $(curl -fsS "$base/api/health")"
email="smoke-$(date +%s)@example.com"
curl -fsS -X POST "$base/api/auth/request" -H "Origin: $base" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\"}" >/dev/null
sleep 1
link=$(docker compose -f "$here/compose.yaml" logs api 2>&1 | grep "$email" | grep -o 'http[^ ]*' | tail -1)
[ -n "$link" ] || { echo "no sign-in link in the API log"; exit 1; }
# Follow the link as a browser would (it points at APP_ORIGIN, which may differ from $base).
path=${link#*://*/}
curl -fsS -c "$jar" -o /dev/null "$base/$path"
me=$(curl -fsS -b "$jar" "$base/api/me")
echo "me:     $me"
echo "$me" | grep -q "$email" && echo "smoke test passed"
