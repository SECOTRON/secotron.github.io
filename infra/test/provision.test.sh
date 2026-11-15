#!/usr/bin/env bash
# Runs infra/provision.sh against a fake `az` and checks TURNSTILE_SECRET is
# never clobbered. No Azure access needed. Run from repo root:
#   bash infra/test/provision.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/az" <<'EOF'
#!/usr/bin/env bash
echo "az $*" >> "$AZLOG"
case "$*" in
  *"appsettings list"*) echo "${EXISTING_SECRET_NAME:-}" ;;
  *"identity show"*|*"ad sp show"*) echo "00000000-0000-0000-0000-000000000000" ;;
esac
EOF
chmod +x "$TMP/az"

fail=0
run() { # $1 = name, $2 = expected secret arg (or "NONE"), $3 = expected output snippet
  export AZLOG="$TMP/az.log"
  : > "$AZLOG"
  local out
  out=$(cd "$ROOT" && PATH="$TMP:$PATH" bash infra/provision.sh 2>&1)
  local sent
  sent=$(grep "appsettings set" "$AZLOG" | grep -o "TURNSTILE_SECRET=[^ ]*" || echo NONE)
  if [[ "$sent" == "$2" && "$out" == *"$3"* ]]; then
    echo "PASS $1"
  else
    echo "FAIL $1 (sent: $sent)"
    return 1
  fi
}

( export TURNSTILE_SECRET=s3cret EXISTING_SECRET_NAME=
  run "exported secret is set" "TURNSTILE_SECRET=s3cret" "==> App settings" ) || fail=1
( unset TURNSTILE_SECRET; export EXISTING_SECRET_NAME=TURNSTILE_SECRET
  run "unexported secret keeps existing setting" "NONE" "keeping the existing app setting" ) || fail=1
( unset TURNSTILE_SECRET; export EXISTING_SECRET_NAME=
  run "unexported + missing secret warns" "NONE" "WARNING: TURNSTILE_SECRET not exported" ) || fail=1

exit "$fail"
