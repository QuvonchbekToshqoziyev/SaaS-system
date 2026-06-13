# Mistakes Log

## Auth Role Mismatch & Dashboard Blank Page
- **Symptom**: Dashboard and other panels returned a blank page or failed to load correctly for users logging in. 
- **Root cause**: The backend uses an uppercase `Role` enum (`SUPERADMIN`, `ADMIN`, `FIRM`), but the frontend `DashboardLayout.tsx` and `login/page.tsx` were doing a strict equality check (`user.role === 'firm'`). Additionally, when `user` was missing, `DashboardLayout` simply returned `null` instead of triggering a router redirect, causing a blank page.
- **Fix**: 
  1. Updated `DashboardLayout.tsx` and `login/page.tsx` to use case-insensitive checking (`user.role.toLowerCase() === 'firm'`).
  2. Added a `useEffect` inside `DashboardLayout.tsx` to explicitly perform `router.push('/login')` if `!user` and `!isLoading`.
- **Verification step**: Re-ran the Next.js production build (`npm run build`). Confirmed components type-checked correctly and navigation references were resolved.
- **Prevention note**: Always normalize string enums (especially `role` or `status` flags) when crossing the boundary between an Express backend and a Next.js frontend, and ensure unauthenticated layout states correctly fallback via `router.push`.

## Prisma Field Renaming Data Loss Risk
- **Symptom**: Database columns (`departureTime`, `arrivalTime`, `allocatedFirmId`, `price`) would be dropped (causing massive data loss) when applying the new Prisma schema because fields were renamed in the Prisma schema to fix TypeScript errors.
- **Root cause**: The previous agent changed `departureTime` to `departure`, `arrivalTime` to `arrival`, `price` to `basePrice`, and `allocatedFirmId` to `assignedFirmId` in `schema.prisma` without specifying the original column names via the `@map` attribute. Prisma interprets a renamed field without `@map` as dropping the old column and creating a new one.
- **Fix**: Added `@map("departureTime")`, `@map("arrivalTime")`, `@map("price")`, and `@map("allocatedFirmId")` to the respective fields in `airline-b2b/server/prisma/schema.prisma` to map them back to their existing physical database columns.
- **Verification step**: Ran `npx prisma generate && npm run build` successfully, ensuring the codebase types are aligned without redefining the physical columns.
- **Prevention note**: Whenever renaming a field in `schema.prisma` that already exists in a production database, you MUST use the `@map("original_column_name")` attribute to prevent Prisma from dropping the column and losing data.

## Prisma Schema and Ticket Controller Mismatch
- **Symptom**: Ticket allocation/sale/cancellation flows could fail at runtime because raw SQL referenced Prisma model field names (`assignedFirmId`) instead of mapped database column names (`allocatedFirmId`), and sale-cancellation controllers selected/wrote fields missing from `schema.prisma`.
- **Root cause**: The ORM layer used mapped Prisma names (`assignedFirmId`, `basePrice`) while raw SQL still needed physical column names. The `SaleCancellationRequest` model also lagged behind controller behavior for flight, reason, created-by, and decision fields.
- **Fix**: Updated `tickets.controller.ts` raw ticket locks to filter on `"allocatedFirmId"` and alias `"allocatedFirmId"`/`"price"` back to `assignedFirmId`/`basePrice`; expanded `SaleCancellationRequest` relations and fields in `schema.prisma`; updated seed scripts to use current Prisma field names and required transaction summary fields.
- **Verification step**: Ran `npx prisma generate`, `npx prisma validate`, `npm run build`, and a direct `tsc --noEmit` check for the touched Prisma seed scripts.
- **Prevention note**: When using `@map`, keep raw SQL in physical database column names and alias results back to Prisma/API names. After schema changes, regenerate Prisma and type-check scripts outside `src` if they are touched.

## Partial Backend Deploy Build Failure
- **Symptom**: The production server build failed after copying only `schema.prisma`, ticket controller, and seed scripts to the PM2 deployment.
- **Root cause**: The active PM2 server had older controllers that still referenced stale Prisma names (`departureTime`, `allocatedFirmId`, old includes), while the copied schema generated a newer Prisma client.
- **Fix**: Synced the full backend `src`, `prisma`, and server config/package files to `/root/airline-b2b/server`, then ran `npm install`, `npx prisma validate`, `npx prisma generate`, `npx prisma db push`, `npm run build`, and `pm2 restart airline-backend --update-env`.
- **Verification step**: Confirmed the remote build passed, PM2 showed `airline-backend` online, logs showed `Server running` on port 5000, and `curl http://127.0.0.1:5000/flights` returned the expected protected-route `401 No token`.
- **Prevention note**: Deploy schema/controller changes as one coherent backend source tree. Avoid partial production copies when Prisma model names changed across multiple controllers.
