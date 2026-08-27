#!/usr/bin/env bash
set -euo pipefail

if [[ "${APPLY_SSH_KEY_ONLY:-0}" != "1" || "${VERIFIED_SSH_KEY_LOGIN:-0}" != "1" ]]; then
  echo "Refusing. Verify a separate key-only SSH login, then set APPLY_SSH_KEY_ONLY=1 VERIFIED_SSH_KEY_LOGIN=1." >&2
  exit 1
fi
[[ "${EUID:-$(id -u)}" == "0" ]] || { echo "Run as root" >&2; exit 1; }
[[ -s /root/.ssh/authorized_keys ]] || { echo "Root authorized_keys is missing or empty" >&2; exit 1; }

target=/etc/ssh/sshd_config.d/00-ado-b2b-key-only.conf
temporary="$(mktemp)"
previous="$(mktemp)"
had_previous=0
success=0
if [[ -f "$target" ]]; then
  cp -a "$target" "$previous"
  had_previous=1
fi
cleanup() {
  if [[ "$success" != "1" ]]; then
    if [[ "$had_previous" == "1" ]]; then
      cp -a "$previous" "$target"
    else
      rm -f "$target"
    fi
  fi
  rm -f "$temporary" "$previous"
}
trap cleanup EXIT
cat >"$temporary" <<'SSH'
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
SSH

install -m 600 "$temporary" "$target"
sshd -t
effective="$(sshd -T)"
grep -qx 'passwordauthentication no' <<<"$effective"
grep -qx 'kbdinteractiveauthentication no' <<<"$effective"
grep -qx 'permitrootlogin without-password' <<<"$effective" || grep -qx 'permitrootlogin prohibit-password' <<<"$effective"
systemctl reload ssh 2>/dev/null || systemctl reload sshd
success=1
echo "SSH now accepts root login by public key only."
