---
name: FundedFrens backend recovery
description: Key decisions and quirks from the FundedFrens backend completion task — web6 repo only.
---

# FundedFrens Backend Recovery

## Architecture
- **Monorepo root:** `/home/runner/workspace/web6`
- **Frontend:** `web6/artifacts/fundedfrens` — React/Vite, preview path `/`
- **API server:** `web6/artifacts/api-server` — Express 5, preview path `/api`, port 8080
- **DB package:** `web6/lib/db` — Drizzle ORM on Supabase PostgreSQL
- **Spec:** `web6/lib/api-spec/openapi.yaml` → codegen via `pnpm --filter @workspace/api-spec run codegen`
- **GitHub remote:** `https://github.com/Dicey6/web6.git` (push with `GITHUB_PERSONAL_ACCESS_TOKEN`)

## Bot compatibility constraint
- The frensbot (separate repo, do NOT modify) checks `profiles.updated_at` to validate token age (10-min window).
- The website's `POST /v1/users/telegram/token` intentionally updates `updated_at` when storing the token.
- Do not add a separate `telegram_link_token_expires_at` column — the bot relies on `updated_at`.

## Port collision issue (solved)
- Both `artifacts/api-server` (old, root-level) and `web6/artifacts/api-server` use `localPort = 8080`.
- The old workflow must be STOPPED (via `stopWorkflow`) before the web6 one can start.
- Use `stopWorkflow({ name: "artifacts/api-server: API Server" })` in CodeExecution if it collides again.

## Express 5 typing quirk
- `req.params.foo` is typed as `string | string[]` in Express 5 — always cast: `String(req.params.foo)` before passing to Drizzle `eq()`.

## Referral commission rate
- Fixed at 20% of `order.amount` (USD), credited in `referral_earnings` when `POST /v1/orders/:orderId/confirm` is called.

## Admin payouts response format
- The frontend `admin/Payouts.tsx` expects a plain array (`.length`, `.map`), so `GET /v1/admin/payouts` returns `Payout[]` directly (no pagination wrapper).
