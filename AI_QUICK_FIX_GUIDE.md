# AI Quick Fix Guide

Use this file first when asking any AI model for a quick website fix. It keeps the model focused and avoids wasting tokens.

## Correct Project

Work only here:

```text
/home/quvonchbek/dead/SaaS-system
```

The real app is:

```text
airline-b2b/
```

Do not modify this mistaken sibling copy:

```text
/home/quvonchbek/dead/airline-b2b
```

## Read These First

For most fixes, read only:

```text
AI_QUICK_FIX_GUIDE.md
FINAL_RELEASE_PLAN.md
README.md
memories/repo/mistakes.md
```

Then search targeted files with `rg`. Do not scan every file.

## App Map

Frontend:

```text
airline-b2b/client/src/app
airline-b2b/client/src/components
airline-b2b/client/src/contexts
airline-b2b/client/src/lib/api.ts
```

Backend:

```text
airline-b2b/server/src/controllers
airline-b2b/server/src/routes
airline-b2b/server/src/services
airline-b2b/server/src/middleware
airline-b2b/server/prisma/schema.prisma
```

Shared:

```text
airline-b2b/shared
```

## Common Fix Targets

- Login page: `airline-b2b/client/src/app/login/page.tsx`
- Login page editor: `airline-b2b/client/src/app/(dashboard)/settings/page.tsx`
- Dashboard nav/layout: `airline-b2b/client/src/components/layout/DashboardLayout.tsx`
- Auth state/role normalization: `airline-b2b/client/src/contexts/AuthContext.tsx`
- API base URL: `airline-b2b/client/src/lib/api.ts`
- Express app routes: `airline-b2b/server/src/index.ts`
- Auth backend: `airline-b2b/server/src/controllers/auth.controller.ts`
- Firms backend: `airline-b2b/server/src/controllers/firms.controller.ts`
- Tickets backend: `airline-b2b/server/src/controllers/tickets.controller.ts`
- Transactions backend: `airline-b2b/server/src/controllers/transactions.controller.ts`
- Kassa backend: `airline-b2b/server/src/services/kassa.service.ts`
- Prisma schema: `airline-b2b/server/prisma/schema.prisma`

## Rules For AI Agents

- Use `rg` or `rg --files` for discovery.
- Read the specific route/controller/page before editing it.
- Never change generated folders: `node_modules`, `.next`, `out`, `dist`.
- Never use destructive git commands.
- Never overwrite unrelated dirty changes.
- For Prisma field renames, use `@map("old_column")` to protect production data.
- Raw SQL must use real database column names, then alias results back to API names.
- Normalize roles before comparing: `SUPERADMIN`, `ADMIN`, `FIRM` may cross the client as lowercase.
- Login page content editing is `SUPERADMIN` only.
- After backend schema changes, run `npx prisma validate`, `npx prisma generate`, and `npm run build`.
- After frontend changes, run `npx tsc --noEmit`; run `npm run build` before release.

## Minimal Check Commands

Backend:

```bash
cd airline-b2b/server
npx prisma validate
npx prisma generate
npm test
npm run build
```

Frontend:

```bash
cd airline-b2b/client
npx tsc --noEmit
npm run build
```

Deploy only after the checks pass:

```bash
./deploy.sh --schema
```

## Useful Search Commands

Find a route:

```bash
rg -n "app.use|router\\." airline-b2b/server/src
```

Find a frontend page:

```bash
rg -n "export default function|useAuth|api\\." airline-b2b/client/src/app
```

Find role checks:

```bash
rg -n "SUPERADMIN|ADMIN|FIRM|superadmin|admin|firm" airline-b2b/client/src airline-b2b/server/src
```

Find Prisma model usage:

```bash
rg -n "prisma\\.|model |@map|\\$queryRaw" airline-b2b/server
```
