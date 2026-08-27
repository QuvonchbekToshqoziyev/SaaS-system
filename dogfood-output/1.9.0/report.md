# ADO SYSTEM 1.9.0 Dev Strict Audit

Date: 2026-08-27

Target: https://dev.b2b.booking.ado-finance.com

Verdict: dev release gate and host security remediation passed. Production
promotion remains blocked pending release acceptance and explicit approval.

## Findings

### Resolved - Host security baseline

- UFW is active with default-deny inbound policy and only `22`, `80`, and `443`
  allowed for IPv4/IPv6.
- fail2ban is active with `sshd`, `nginx-http-auth`, and `ado-b2b-login` jails;
  the ADO login filter matched a synthetic Nginx `401` line.
- Effective SSH policy is public-key only: password and keyboard-interactive
  authentication are disabled, and root is limited to public-key login.
- Unknown Host and direct-IP HTTP/TLS requests are rejected by the default Nginx
  server. Only ADO prod, ADO dev, and the default reject site remain enabled.
- Eight legacy OpenBudget/taxi services and the Telegram PM2 app are disabled;
  PM2 startup now contains only ADO prod and dev.
- Deploy and remote-maintenance scripts now default to the verified Ed25519 key;
  the production deploy also honors `REMOTE_SERVER_IP` for the VPS migration.

### Resolved - Backup policy

- `ado-b2b-postgres-backup.timer` is enabled and runs daily with encryption
  required and two-copy VPS retention.
- Exactly two mode-`600` encrypted dumps remain on the VPS; the old unencrypted
  dump was removed by the verified retention run.
- The local persistent user timer pulls encrypted backups off-server and verifies
  remote/local SHA-256 checksums. Local backup and recovery-secret files are
  mode `600` under the ignored `.private-backups/` directory.
- A PostgreSQL 16.15 restore test decrypted the latest archive, restored 60
  public tables into `ado_b2b_restore_test`, and removed the disposable database.

### Resolved - Production encryption prerequisites

- Production now has stable `CHAT_ENCRYPTION_KEY` and
  `BACKUP_ENCRYPTION_PASSPHRASE` values with mode-`600` environment storage and
  an off-server recovery copy. Secret values were not logged.
- PM2 production was not restarted and remains on 1.8.0 with zero restarts; the
  chat key becomes active when the approved 1.9.0 release starts.
- PostgreSQL stayed on 16.15, but package maintenance restarted its service once
  at 05:35 UTC. The post-restart encrypted backup restore and public smoke passed.

## Defects Fixed During Audit

1. `/auth/mfa/disable` allowed firm roles to reach admin account lookup and returned `404`. The route now rejects non-admin roles with `403` before controller logic.
2. Critical browser tests still expected the old `ADO Financial` heading after the expansion rename. Assertions now match `ADO SYSTEM`.
3. The mobile drawer and document metadata still used the airline-accounting identity. They now use the ADO SYSTEM business-management identity.
4. Persistent Next.js navigation auto-prefetched every visible route. Under three concurrent browsers this created large waves of `HEAD` requests and stalled session checks. Prefetch is disabled for desktop, bottom, and mobile navigation links.

## Passed Evidence

- Version and changelog consistency: `1.9.0`.
- API contracts: 177 mounted endpoints, 177 contracts, zero missing/stale contracts, zero unmatched client calls.
- Regression guards: 94/94.
- Runtime dependency audits: zero vulnerabilities in server and client production dependencies.
- Prisma validation and client generation: passed.
- Server tests: 50 files, 169 tests passed.
- Server TypeScript build: passed.
- Client TypeScript and production build: passed; 27 static routes generated.
- Dev endpoint/RBAC audit: 999/999 probes passed.
- Tenant isolation audit: 35/35 checks passed.
- Release fixture audit: 51/51 checks passed.
- Kassa five-role workflow: 7/7 checks passed, including open, close, reopen, history, wrong-desk denial, and cleanup.
- Chromium E2E: 10/10 tests passed across superadmin, admin, firm admin, manager, kassir, and warehouse manager.
- Dev application stderr: empty in the inspected tail.
- Recent dev HTTP status sample: no 5xx responses.
- Production public smoke: login and all inspected dashboard deep links passed; production PM2 remained online on 1.8.0 with zero restarts.

## Rendered And Artifact Checks

- Clean Chromium role-flow execution completed against deployed dev.
- The generated and deployed `/firm/` artifact contains `ADO SYSTEM`, the business-management metadata, the corrected mobile drawer label, and `prefetch: false` navigation behavior.
- The independent in-app browser plugin had no available browser session, so no additional plugin-driven screenshots were captured. This is a tooling limitation, not a release pass substituted for a failed browser test.

## Remaining Production Gates

- Review the production Prisma migration diff for destructive SQL.
- Manually exercise ticket allocation/sale/cancellation, invite acceptance, login-page content mutation permissions, and Telegram preference changes if those surfaces are included in the production release acceptance scope.
- Obtain explicit production cutover approval. No production deployment was performed.
