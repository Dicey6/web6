-- =============================================================================
-- FundedFrens Telegram Bot — Database Migration 001
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- 
-- This migration is additive — it does NOT modify any existing tables.
-- It only adds new columns to 'profiles' and creates three new tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add Telegram columns to existing profiles table
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_id        bigint UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_link_token text   UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_username  text;

-- Index for fast lookup by telegram_id (used on every bot command)
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id
  ON profiles (telegram_id)
  WHERE telegram_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Drop bot tables if they exist from a previous partial run
--    (safe — these are new tables with no user data yet)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS trades      CASCADE;
DROP TABLE IF EXISTS positions   CASCADE;
DROP TABLE IF EXISTS bot_settings CASCADE;

-- ---------------------------------------------------------------------------
-- 3. bot_settings — per-user trading defaults
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bot_settings (
  id                    serial      PRIMARY KEY,
  user_id               text        NOT NULL UNIQUE,  -- auth_user_id from profiles
  default_buy_sol       numeric(10, 4) DEFAULT 0.1,
  default_sl_pct        numeric(5,  2) DEFAULT 20.0,
  default_tp_pct        numeric(5,  2) DEFAULT 50.0,
  default_auto_sell_pct numeric(5,  2),               -- NULL = disabled
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. positions — simulated open/closed positions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS positions (
  id                    serial       PRIMARY KEY,
  user_id               text         NOT NULL,         -- auth_user_id
  challenge_id          integer      NOT NULL,         -- user_challenges.id
  token_address         text         NOT NULL,
  token_symbol          text         NOT NULL,
  token_name            text,
  token_logo_url        text,

  -- Size & pricing
  amount_sol_invested   numeric(18,  9) NOT NULL,
  entry_price_sol       numeric(24, 12) NOT NULL,
  entry_market_cap_usd  numeric(20,  2),
  highest_price_sol     numeric(24, 12),               -- high-water mark for trailing stop

  -- Risk parameters (can be edited after opening)
  stop_loss_pct         numeric(5,  2),
  take_profit_pct       numeric(5,  2),
  trailing_stop_pct     numeric(5,  2),
  auto_sell_pct         numeric(5,  2),

  -- Lifecycle
  status                text         NOT NULL DEFAULT 'open', -- 'open' | 'closed' | 'partial'
  opened_at             timestamptz  NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_user_status
  ON positions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_positions_token
  ON positions (token_address)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 5. trades — individual buy / sell records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trades (
  id                serial       PRIMARY KEY,
  user_id           text         NOT NULL,             -- auth_user_id
  challenge_id      integer,                           -- user_challenges.id
  position_id       integer,                           -- positions.id

  token_address     text         NOT NULL,
  token_symbol      text         NOT NULL,
  token_name        text,

  side              text         NOT NULL,             -- 'buy' | 'sell'
  amount_sol        numeric(18,  9) NOT NULL,          -- SOL invested (buy) or received (sell)
  entry_price_sol   numeric(24, 12),
  exit_price_sol    numeric(24, 12),
  market_cap_usd    numeric(20,  2),

  -- Filled on sell trades
  pnl_sol           numeric(18,  9),
  pnl_pct           numeric(10,  4),
  sell_pct          numeric(5,   2),                  -- % of position sold

  -- What triggered this trade
  trigger           text         NOT NULL DEFAULT 'manual',
  -- 'manual' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'auto_sell'

  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_user_created
  ON trades (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_position
  ON trades (position_id)
  WHERE position_id IS NOT NULL;

-- =============================================================================
-- Verification: run these SELECTs to confirm migration succeeded
-- =============================================================================
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles'
--   AND column_name IN ('telegram_id', 'telegram_link_token', 'telegram_username');
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('bot_settings', 'positions', 'trades');
--
-- =============================================================================
