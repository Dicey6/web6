---
name: FundedFrens backend recovery
description: Key decisions and quirks from the FundedFrens backend — web6 repo.
---

# FundedFrens Backend

## Architecture
- **Monorepo root:** `/home/runner/workspace/web6`
- **Frontend:** `web6/artifacts/fundedfrens` — React/Vite, preview path `/`
- **API server:** `web6/artifacts/api-server` — Express 5, preview path `/api`, port 8080
- **DB package:** `web6/lib/db` — Drizzle ORM on Supabase PostgreSQL
- **Spec:** `web6/lib/api-spec/openapi.yaml` → codegen via `pnpm --filter @workspace/api-spec run codegen`
- **GitHub remote:** `https://github.com/Dicey6/web6.git` (push with `GITHUB_PERSONAL_ACCESS_TOKEN`; use `--force` if diverged on memory-only files)

## Plans — hardcoded, not DB-seeded
- Plans are defined in `artifacts/api-server/src/routes/plans.ts` as `HARDCODED_PLANS` (IDs 1/2/3, slugs starter/standard/elite).
- USD price is the permanent source of truth; `funded_sol` is computed dynamically from live CoinGecko price (60s cache in `lib/solPrice.ts`).
- Do NOT add a `challenge_plans` seed migration — plans are intentionally not in the DB.

## Payment flow — fully automatic via Helius
- `POST /v1/orders` creates order with live SOL price.
- `GET /v1/orders/:orderId/payment-status` (polled by frontend every 5s) calls Helius via `lib/helius.ts` to check for matching on-chain payment.
- On detection: atomic `UPDATE ... WHERE status='pending'` prevents double-activation; `activatePurchase()` creates `user_challenges`, credits referral, logs activity.
- Required env var on Render: `HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<KEY>`

## DB columns added
- `orders.received_sol` (numeric 10,6) — migration: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_sol numeric(10,6);`
- `profiles.telegram_id`, `telegram_link_token`, `telegram_username` — added via frensbot migration 001.

## Bot compatibility constraint
- The frensbot checks `profiles.updated_at` to validate token age (10-min window).
- `POST /v1/users/telegram/token` updates `updated_at` when storing the token — intentional.

## Port collision issue (solved)
- Both `artifacts/api-server` (root-level) and `web6/artifacts/api-server` use port 8080.
- Stop the root-level one before starting the web6 one if they collide.

## Express 5 typing quirk
- `req.params.foo` typed as `string | string[]` — always cast: `String(req.params.foo)`.

## Referral commission
- Fixed at 20% of `order.amount` (USD), credited in `referral_earnings` on auto-activation.

## Admin payouts response format
- Frontend expects plain array (`.map()`), so `GET /v1/admin/payouts` returns `Payout[]` directly.
