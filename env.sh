#!/usr/bin/env bash
# Prints one Candylario service's settings from the one file that holds them
# all, ../.env next to the repos. Keys before the first [section] are shared;
# [trader], [notifier] and [app] hold values for one service, such as its
# POSTGRES_PASSWORD. [user] holds your own keys as a platform user, which go
# into the app and are never printed. A service gets only the keys its
# .env.example lists, so the app never holds the engine's master key. Each
# service's deploy.sh ships this output.
#
#   ./env.sh trader|notifier|app
set -euo pipefail
svc=${1:-}
cd "$(dirname "$0")"
src=../.env
case $svc in
trader | notifier | app) ;;
*)
  echo "usage: ./env.sh trader|notifier|app" >&2
  exit 1
  ;;
esac
[ -f "$src" ] || {
  echo "$src is missing" >&2
  exit 1
}

awk -v svc="$svc" '
  /^[ \t]*(#|$)/ { next }
  FNR == NR && /^\[.*\]$/ { sect = substr($0, 2, length($0) - 2); next }
  { i = index($0, "="); if (!i) next; k = substr($0, 1, i - 1); v = substr($0, i + 1) }
  FNR == NR { if (sect == "") shared[k] = v; else if (sect == svc) own[k] = v; next }
  {
    if (k in own) v = own[k]; else if (k in shared) v = shared[k]
    print k "=" v
    if (v == "") printf "%s: %s is empty\n", svc, k >"/dev/stderr"
  }
' "$src" "../$svc/.env.example"
