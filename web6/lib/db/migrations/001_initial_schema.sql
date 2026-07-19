-- =============================================================================
-- FundedFrens — Initial Database Schema
-- =============================================================================
-- Run this in the Supabase SQL Editor (Database → SQL Editor → New query).
-- It is safe to run multiple times (all statements use IF NOT EXISTS).
-- This schema mirrors lib/db/src/schema/index.ts exactly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- Extends Supabase auth.users. One row per registered user.
-- auth_user_id links to auth.users.id (UUID stored as text).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  serial primary key,
  auth_user_id        text        not null unique,
  email               text        not null,
  username            text,
  role                text        not null default 'user',      -- 'user' | 'admin'
  telegram_status     text        not null default 'not_linked', -- 'not_linked' | 'linked'
  wallet_address      text,
  referral_code       text        unique,
  referred_by         text,       -- auth_user_id of the referrer
  telegram_id         bigint,
  telegram_link_token text,
  telegram_username   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- challenge_plans
-- Stores the funded account evaluation tiers.
-- Currently served from hardcoded values in the API; this table is reserved
-- for future admin-managed plans.
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_plans (
  id                    serial primary key,
  name                  text           not null,
  slug                  text           not null unique,
  price_usd             numeric(10,2)  not null,
  funded_sol            numeric(10,4)  not null,
  funded_usd_estimate   numeric(10,2),
  status                text           not null default 'active',
  display_order         integer        not null default 0,
  description           text,
  profit_target_pct     numeric(5,2)   not null,
  max_drawdown_pct      numeric(5,2)   not null,
  daily_drawdown_pct    numeric(5,2)   not null,
  min_trading_days      integer        not null,
  max_position_size_pct numeric(5,2)   not null,
  max_open_positions    integer        not null,
  reactivation_cost_pct numeric(5,2)   not null,
  created_at            timestamptz    default now(),
  updated_at            timestamptz    default now()
);

-- ---------------------------------------------------------------------------
-- user_challenges
-- Tracks each user's active or completed challenge attempt.
-- ---------------------------------------------------------------------------
create table if not exists public.user_challenges (
  id                serial primary key,
  user_id           text           not null,   -- auth_user_id
  challenge_plan_id integer        not null,
  order_id          integer,
  status            text           not null default 'pending',
  started_at        timestamptz,
  expires_at        timestamptz,
  completed_at      timestamptz,
  failed_at         timestamptz,
  profit_target_pct numeric(5,2),
  max_drawdown_pct  numeric(5,2),
  created_at        timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- orders
-- Records every purchase attempt, including on-chain payment tracking.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                serial primary key,
  user_id           text           not null,   -- auth_user_id
  challenge_plan_id integer,
  status            text           not null default 'pending',
  amount            numeric(10,2)  not null,
  currency          text           not null default 'USD',
  plan_name         text,
  plan_slug         text,
  expected_sol      numeric(10,6),
  sol_price_usd     numeric(10,2),
  treasury_wallet   text,
  expiry_time       timestamptz,
  payment_status    text,
  tx_signature      text,
  received_sol      numeric(10,6),
  referral_code     text,
  confirmed_at      timestamptz,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- referral_earnings
-- Records commission earned by referrers when their referred users purchase.
-- ---------------------------------------------------------------------------
create table if not exists public.referral_earnings (
  id               serial primary key,
  referrer_id      text           not null,   -- auth_user_id
  referred_user_id text           not null,   -- auth_user_id
  order_id         integer,
  amount           numeric(10,2)  not null,
  status           text           not null default 'pending',  -- 'pending' | 'paid' | 'cancelled'
  created_at       timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- payouts
-- Tracks payout requests from users withdrawing their referral earnings.
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id               serial primary key,
  user_id          text           not null,   -- auth_user_id
  amount           numeric(10,2)  not null,
  wallet_address   text           not null,
  status           text           not null default 'pending',
  tx_signature     text,
  rejection_reason text,
  created_at       timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- activity_logs
-- Append-only audit log for user-visible events.
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id         serial primary key,
  user_id    text,
  action     text           not null,
  details    text,
  created_at timestamptz    not null default now()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- The API server connects via DATABASE_URL using the postgres superuser role,
-- which bypasses RLS. These policies protect direct Supabase client access.

alter table public.profiles         enable row level security;
alter table public.challenge_plans  enable row level security;
alter table public.user_challenges  enable row level security;
alter table public.orders           enable row level security;
alter table public.referral_earnings enable row level security;
alter table public.payouts          enable row level security;
alter table public.activity_logs    enable row level security;

-- challenge_plans is public (anyone can read active plans)
create policy if not exists "plans_public_read"
  on public.challenge_plans for select using (true);

-- profiles: users can read and update their own row
create policy if not exists "profiles_own_select"
  on public.profiles for select
  using (auth.uid()::text = auth_user_id);

create policy if not exists "profiles_own_update"
  on public.profiles for update
  using (auth.uid()::text = auth_user_id);

create policy if not exists "profiles_own_insert"
  on public.profiles for insert
  with check (auth.uid()::text = auth_user_id);

-- user_challenges: users see their own challenges
create policy if not exists "challenges_own_select"
  on public.user_challenges for select
  using (auth.uid()::text = user_id);

-- orders: users see their own orders
create policy if not exists "orders_own_select"
  on public.orders for select
  using (auth.uid()::text = user_id);

-- referral_earnings: users see earnings where they are the referrer
create policy if not exists "earnings_own_select"
  on public.referral_earnings for select
  using (auth.uid()::text = referrer_id);

-- payouts: users see their own payouts
create policy if not exists "payouts_own_select"
  on public.payouts for select
  using (auth.uid()::text = user_id);

-- activity_logs: users see their own logs
create policy if not exists "logs_own_select"
  on public.activity_logs for select
  using (auth.uid()::text = user_id);
