---
name: FundedFrens backend fix
description: What was broken, what was built, and key gotchas for the Dicey6/web6 project.
---

## What was broken
The Express server (`artifacts/api-server`) was a skeleton with only `/api/healthz`.
Every frontend API call returned 404, which only became visible after commit f614d2c added
an HTML-response guard in customFetch — surfacing the silent failures as real errors.

## What was built (commit 0273ee3)
- `lib/db/src/schema/index.ts` — Drizzle schema for all tables
- `artifacts/api-server/src/middlewares/auth.ts` — requireAuth + requireAdmin via supabaseAdmin.auth.getUser(token)
- `artifacts/api-server/src/routes/` — plans, users, orders, referrals, admin
- `artifacts/api-server/src/routes/index.ts` — mounts all routers
- `artifacts/api-server/src/app.ts` — CORS reads ALLOWED_ORIGINS env var
- `artifacts/api-server/package.json` — added @supabase/supabase-js
- `artifacts/fundedfrens/src/lib/supabase.ts` — explicit console.error when VITE_ vars missing
- `.env.example` + `replit.md` — full env var docs and deployment guide

## Required env vars before the app works end-to-end

**Vercel (frontend):** VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL (full Render URL)

**Render (backend):** PORT (auto), DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, TREASURY_WALLET

## Key gotchas
- Profile auto-creation: GET /v1/users/profile upserts the profile row on first call.
- VITE_API_URL must be the full Render URL (not a relative /api path) — on Vercel the SPA rewrite catches relative API paths and returns HTML.
- DB tables must be created: run `pnpm --filter @workspace/db run push` against DATABASE_URL once.
- The Supabase project may already have tables from a previous implementation — check before running push, or schema conflicts will occur.

**Why:** Auth appeared broken only after the HTML-guard was added. The real issue was the missing backend from day one.
