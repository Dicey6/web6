# FundedFrens — Backend Rebuild Documentation

## Overview

The Express API backend has been fully rewritten to use Supabase as the single source of truth. All Drizzle ORM / direct PostgreSQL calls have been replaced with Supabase client calls. The frontend is completely unchanged.

## Architecture

```
Website (Vercel)
     ↓ JWT in Authorization header
Express API Server (Render)
     ↓ service role key (bypasses RLS)
Supabase (PostgreSQL + Auth + RLS)
     ↑
Telegram Bot (Render) — reads/writes via service role key
```

A Supabase Edge Function (`verify-payment`) handles privileged blockchain verification. It can be called on a schedule or triggered via webhook to sweep pending orders.

---

## Files Modified

### New Files
- `artifacts/api-server/src/lib/supabaseAdmin.ts` — Supabase admin client singleton
- `supabase/migrations/001_initial_schema.sql` — Full PostgreSQL schema + RLS
- `supabase/functions/verify-payment/index.ts` — Edge Function for payment verification
- `docs/BACKEND_REBUILD.md` — This document

### Rewritten Files
- `artifacts/api-server/src/middlewares/auth.ts` — Now uses shared supabaseAdmin
- `artifacts/api-server/src/routes/users.ts` — Supabase instead of Drizzle
- `artifacts/api-server/src/routes/orders.ts` — Supabase instead of Drizzle
- `artifacts/api-server/src/routes/referrals.ts` — Supabase instead of Drizzle
- `artifacts/api-server/src/routes/admin.ts` — Supabase instead of Drizzle
- `.env.example` — Updated variable names

---

## Database Migration

Run this SQL in your Supabase project:

1. Go to **Supabase Dashboard → SQL Editor**
2. Paste the contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run**

This creates all tables, indexes, RLS policies, and the auto-profile trigger.

---

## Environment Variables

### Render (API Server)

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://uxzfnasjiimaiflokasm.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key from Supabase Dashboard |
| `HELIUS_RPC_URL` | `https://mainnet.helius-rpc.com/?api-key=<your-key>` |
| `TREASURY_WALLET` | `CKayu8Va1UVy1jop6kRT5zsyk24urQQhJdqZwttVQwTt` |
| `APP_URL` | `https://fundedfrens.com` |
| `ALLOWED_ORIGINS` | Your Vercel deployment URLs |
| `PORT` | `8080` (Render sets this automatically) |

### Vercel (Frontend)

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://uxzfnasjiimaiflokasm.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your anon key from Supabase Dashboard |
| `VITE_API_URL` | Leave empty (same-origin `/api` routes) |

### Supabase Edge Function Secrets

Set these in Supabase Dashboard → Settings → Edge Functions → Secrets:

| Secret | Value |
|---|---|
| `HELIUS_API_KEY` | `d5381285-5b00-4ad2-9255-581b5e55e2cc` |
| `TREASURY_WALLET` | `CKayu8Va1UVy1jop6kRT5zsyk24urQQhJdqZwttVQwTt` |
| `APP_URL` | `https://fundedfrens.com` |

---

## Deploying the Edge Function

Install Supabase CLI and run:

```bash
supabase login
supabase link --project-ref uxzfnasjiimaiflokasm
supabase functions deploy verify-payment
```

To set Edge Function secrets:
```bash
supabase secrets set HELIUS_API_KEY=d5381285-5b00-4ad2-9255-581b5e55e2cc
supabase secrets set TREASURY_WALLET=CKayu8Va1UVy1jop6kRT5zsyk24urQQhJdqZwttVQwTt
supabase secrets set APP_URL=https://fundedfrens.com
```

---

## Telegram Bot Compatibility

The bot (`frensbot`) is **fully compatible** with this schema. It reads/writes:

- `profiles.telegram_id` — bot stores Telegram user ID here
- `profiles.telegram_link_token` — website generates; bot consumes
- `profiles.telegram_link_token_exp` — renamed from `token_expires_at` in original bot migration
- `profiles.telegram_username` — bot stores Telegram username
- `profiles.telegram_status` — bot updates to `'linked'`
- `bot_settings` — bot-specific trading defaults
- `positions` — open simulated trades
- `trades` — trade ledger

### Required Bot Change (documentation only)

The `telegram_link_token_exp` column name differs from the original bot migration `001_bot_tables.sql` which may use a different column name. **Update `database.py` in `frensbot`** to use `telegram_link_token_exp` for token expiry checking.

No other bot changes required.

---

## Security Notes

- The service role key is **never sent to the browser** — only used in Express routes and Edge Functions
- RLS is enabled on all tables — direct Supabase calls from the frontend are scoped to the authenticated user
- Payment verification uses Helius with replay protection via `tx_signature` uniqueness
- Telegram tokens expire after 10 minutes
- Orders expire after 30 minutes — stale orders are swept by the Edge Function

---

## Testing Checklist

- [ ] Signup creates a profile automatically (via trigger)
- [ ] Login persists session after page refresh
- [ ] Profile save (username, wallet) persists
- [ ] Telegram token generation works
- [ ] Dashboard loads real data
- [ ] Challenge plans display with live SOL price
- [ ] Order creation works with correct SOL amount
- [ ] Payment verification detects on-chain payment
- [ ] Challenge activates after payment
- [ ] Referral commission credited on first purchase
- [ ] Admin panel loads users, orders, payouts
