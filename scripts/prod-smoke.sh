#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://quvonchbek.me}"

get_etag() {
  local path="$1"
  curl -m 20 -sSI "${BASE_URL}${path}" | awk -F': ' 'tolower($1)=="etag" {print $2}' | tr -d '\r' | head -n 1
}

check_not_next_error() {
  local path="$1"
  local url="${BASE_URL}${path}"
  echo "==> GET ${url}"
  # The explicit Next error document has <html id="__next_error__">.
  if curl -m 20 -sSL "$url" | grep -q '<html id="__next_error__">'; then
    echo "FAIL: ${path} is a Next error page"
    return 1
  fi
  echo "OK: ${path}"
}

check_deep_link_not_fallback() {
  local path="$1"
  local root_etag="$2"
  local etag
  etag=$(get_etag "$path")
  if [ -z "$etag" ]; then
    echo "FAIL: ${path} missing ETag (unexpected)"
    return 1
  fi
  if [ "$etag" = "$root_etag" ]; then
    echo "FAIL: ${path} appears to be falling back to / (same ETag)"
    return 1
  fi
  echo "OK: ${path} (unique ETag)"
}

fail=0

root_etag=$(get_etag "/")
if [ -z "$root_etag" ]; then
  echo "FAIL: could not read root ETag"
  exit 1
fi

check_not_next_error "/login/" || fail=1
check_not_next_error "/admin/" || fail=1
check_deep_link_not_fallback "/firms/" "$root_etag" || fail=1
check_deep_link_not_fallback "/settings/" "$root_etag" || fail=1
check_deep_link_not_fallback "/flights/" "$root_etag" || fail=1
check_deep_link_not_fallback "/transactions/" "$root_etag" || fail=1
check_deep_link_not_fallback "/reports/" "$root_etag" || fail=1

if [ "$fail" -ne 0 ]; then
  echo "\nSmoke check FAILED."
  exit 1
fi

echo "\nSmoke check passed."