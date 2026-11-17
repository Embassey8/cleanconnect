#!/usr/bin/env bash
# LOCAL TEST ENVIRONMENT. One command: starts the Dockerised Supabase stack (migrations + seed.sql),
# writes apps/web/.env.local, and loads the test accounts. Re-runnable. Never touches a hosted project.
#   pnpm test-env          start + seed
#   pnpm test-env reset    wipe the database and re-seed
#   pnpm test-env stop     stop the containers
set -euo pipefail
cd "$(dirname "$0")/../../.."
SB="npx --yes supabase@latest"
case "${1:-up}" in
  stop) $SB stop; exit 0 ;;
  reset) $SB db reset ;;
  up) $SB start ;;
  *) echo "usage: pnpm test-env [up|reset|stop]"; exit 1 ;;
esac
STATUS=$($SB status -o env)
val() { echo "$STATUS" | grep "^$1=" | head -1 | cut -d= -f2- | tr -d '"'; }
ENVF=apps/web/.env.local
[ -f "$ENVF" ] || cp apps/web/.env.example "$ENVF"
set_var() { # set_var KEY VALUE
  if grep -q "^$1=" "$ENVF"; then sed -i.bak "s|^$1=.*|$1=$2|" "$ENVF" && rm -f "$ENVF.bak"; else echo "$1=$2" >> "$ENVF"; fi
}
set_var NEXT_PUBLIC_SUPABASE_URL "$(val API_URL)"
set_var NEXT_PUBLIC_SUPABASE_ANON_KEY "$(val ANON_KEY)"
set_var SUPABASE_SERVICE_ROLE_KEY "$(val SERVICE_ROLE_KEY)"
(cd apps/web && node --env-file=.env.local scripts/seed-demo.mjs)
cat <<MSG

Test environment ready. Start the app:  pnpm dev   ->  http://localhost:3000
Mailpit (local email):                  http://127.0.0.1:54324
Supabase Studio:                        http://127.0.0.1:54323

  Role      Email                            Password
  Customer  testuser@cleanconnect.test       Demo-Pass-1234   (wallet funded ₦100,000)
  Service   testservice@cleanconnect.test    Demo-Pass-1234   (approved cleaning provider "Test Service")
  Admin     testadmin@cleanconnect.test      Demo-Pass-1234
MSG
