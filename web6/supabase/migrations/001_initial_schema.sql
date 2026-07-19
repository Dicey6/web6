-- =============================================================================
-- FundedFrens — Initial Supabase Schema
-- Migration 001: Full schema with RLS policies
-- Safe to run on a fresh Supabase project.
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================================================
-- PROFILES — extends auth.users
-- =============================================================================
create table if not exists public.profiles (
  id                         bigserial primary key,
  auth_user_id               uuid not null unique references auth.users(id) on delete cascade,
  email                      text not null,
  username                   text,
  role                       text not null default 'user',       -- 'user' | 'admin'
  telegram_status            text not null default 'not_linked', -- 'not_linked' | 'linked'
  wallet_address             text,
  referral_code              text unique,
  referred_by                uuid,                               -- auth_user_id of referrer
  -- Telegram fields (shared with frensbot)
  telegram_id                bigint unique,
  telegram_link_token        text unique,
  telegram_link_token_exp    timestamptz,
  telegram_username          text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- =============================================================================
-- USER_CHALLENGES
-- =============================================================================
create table if not exists public.user_challenges (
  id                  bigserial primary key,
  user_id             uuid not null,                             -- auth_user_id
  challenge_plan_id   int not null,
  order_id            bigint,
  status              text not null default 'pending',           -- pending | active | passed | failed
  started_at          timestamptz,
  expires_at          timestamptz,
  completed_at        timestamptz,
  failed_at           timestamptz,
  profit_target_pct   numeric(5,2),
  max_drawdown_pct    numeric(5,2),
  created_at          timestamptz not null default now()
);

-- =============================================================================
-- ORDERS
-- =============================================================================
create table if not exists public.orders (
  id                bigserial primary key,
  user_id           uuid not null,                               -- auth_user_id
  challenge_plan_id int,
  status            text not null default 'pending',             -- pending | confirmed | cancelled | expired
  amount            numeric(10,2) not null,
  currency          text not null default 'USD',
  plan_name         text,
  plan_slug         text,
  expected_sol      numeric(12,6),
  received_sol      numeric(12,6),
  sol_price_usd     numeric(10,2),
  treasury_wallet   text,
  expiry_time       timestamptz,
  payment_status    text default 'awaiting_payment',             -- awaiting_payment | confirmed | expired
  tx_signature      text unique,
  referral_code     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =============================================================================
-- REFERRAL_EARNINGS
-- =============================================================================
create table if not exists public.referral_earnings (
  id               bigserial primary key,
  referrer_id      uuid not null,                                -- auth_user_id
  referred_user_id uuid not null,
  order_id         bigint,
  amount           numeric(10,2) not null,
  status           text not null default 'pending',              -- pending | paid | cancelled
  created_at       timestamptz not null default now()
);

-- =============================================================================
-- PAYOUTS
-- =============================================================================
create table if not exists public.payouts (
  id                bigserial primary key,
  user_id           uuid not null,                               -- auth_user_id
  amount            numeric(10,2) not null,
  wallet_address    text not null,
  status            text not null default 'pending',             -- pending | processing | paid | rejected
  tx_signature      text,
  rejection_reason  text,
  created_at        timestamptz not null default now()
);

-- =============================================================================
-- ACTIVITY_LOGS
-- =============================================================================
create table if not exists public.activity_logs (
  id         bigserial primary key,
  user_id    uuid,
  action     text not null,
  details    text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- BOT_SETTINGS — used by frensbot (preserve compatibility)
-- =============================================================================
create table if not exists public.bot_settings (
  id                  bigserial primary key,
  user_id             uuid not null unique,
  default_buy_sol     numeric(10,4) default 0.1,
  default_sl_pct      numeric(5,2)  default 10,
  default_tp_pct      numeric(5,2)  default 25,
  default_auto_sell_pct numeric(5,2) default 50,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =============================================================================
-- POSITIONS — used by frensbot (preserve compatibility)
-- =============================================================================
create table if not exists public.positions (
  id                  bigserial primary key,
  user_id             uuid not null,
  token_address       text not null,
  amount_sol_invested numeric(12,6) not null,
  entry_price_sol     numeric(20,12) not null,
  highest_price_sol   numeric(20,12),
  stop_loss_pct       numeric(5,2),
  take_profit_pct     numeric(5,2),
  auto_sell_pct       numeric(5,2),
  status              text not null default 'open',              -- open | closed | partial
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =============================================================================
-- TRADES — used by frensbot (preserve compatibility)
-- =============================================================================
create table if not exists public.trades (
  id               bigserial primary key,
  user_id          uuid not null,
  position_id      bigint,
  token_address    text not null,
  side             text not null,                                -- buy | sell
  amount_sol       numeric(12,6) not null,
  price_sol        numeric(20,12),
  pnl_sol          numeric(12,6),
  pnl_pct          numeric(8,4),
  trigger          text,                                         -- manual | stop_loss | take_profit | auto_sell
  created_at       timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists idx_profiles_auth_user_id       on public.profiles(auth_user_id);
create index if not exists idx_profiles_referral_code      on public.profiles(referral_code);
create index if not exists idx_profiles_telegram_id        on public.profiles(telegram_id);
create index if not exists idx_user_challenges_user_id     on public.user_challenges(user_id);
create index if not exists idx_orders_user_id              on public.orders(user_id);
create index if not exists idx_orders_tx_signature         on public.orders(tx_signature);
create index if not exists idx_referral_earnings_referrer  on public.referral_earnings(referrer_id);
create index if not exists idx_payouts_user_id             on public.payouts(user_id);
create index if not exists idx_activity_logs_user_id       on public.activity_logs(user_id);
create index if not exists idx_positions_user_id           on public.positions(user_id);
create index if not exists idx_trades_user_id              on public.trades(user_id);

-- =============================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_referral_code text;
begin
  -- Generate a short unique referral code from the user ID
  new_referral_code := upper(substring(new.id::text, 1, 8));

  insert into public.profiles (auth_user_id, email, role, telegram_status, referral_code)
  values (
    new.id,
    coalesce(new.email, ''),
    'user',
    'not_linked',
    new_referral_code
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

-- Drop and recreate trigger to ensure it's current
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
alter table public.profiles         enable row level security;
alter table public.user_challenges  enable row level security;
alter table public.orders           enable row level security;
alter table public.referral_earnings enable row level security;
alter table public.payouts          enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.bot_settings     enable row level security;
alter table public.positions        enable row level security;
alter table public.trades           enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "profiles_select_own"          on public.profiles;
drop policy if exists "profiles_update_own"          on public.profiles;
drop policy if exists "profiles_insert_own"          on public.profiles;
drop policy if exists "profiles_admin_all"           on public.profiles;
drop policy if exists "challenges_select_own"        on public.user_challenges;
drop policy if exists "challenges_admin_all"         on public.user_challenges;
drop policy if exists "orders_select_own"            on public.orders;
drop policy if exists "orders_insert_own"            on public.orders;
drop policy if exists "orders_admin_all"             on public.orders;
drop policy if exists "referrals_select_own"         on public.referral_earnings;
drop policy if exists "referrals_admin_all"          on public.referral_earnings;
drop policy if exists "payouts_select_own"           on public.payouts;
drop policy if exists "payouts_insert_own"           on public.payouts;
drop policy if exists "payouts_admin_all"            on public.payouts;
drop policy if exists "activity_logs_select_own"     on public.activity_logs;
drop policy if exists "bot_settings_select_own"      on public.bot_settings;
drop policy if exists "bot_settings_update_own"      on public.bot_settings;
drop policy if exists "positions_select_own"         on public.positions;
drop policy if exists "trades_select_own"            on public.trades;

-- PROFILES
create policy "profiles_select_own"   on public.profiles for select using (auth_user_id = auth.uid());
create policy "profiles_update_own"   on public.profiles for update using (auth_user_id = auth.uid());
create policy "profiles_insert_own"   on public.profiles for insert with check (auth_user_id = auth.uid());

-- USER_CHALLENGES
create policy "challenges_select_own" on public.user_challenges for select using (user_id = auth.uid());

-- ORDERS
create policy "orders_select_own"     on public.orders for select using (user_id = auth.uid());
create policy "orders_insert_own"     on public.orders for insert with check (user_id = auth.uid());

-- REFERRAL_EARNINGS
create policy "referrals_select_own"  on public.referral_earnings for select using (referrer_id = auth.uid());

-- PAYOUTS
create policy "payouts_select_own"    on public.payouts for select using (user_id = auth.uid());
create policy "payouts_insert_own"    on public.payouts for insert with check (user_id = auth.uid());

-- ACTIVITY_LOGS (users can see their own)
create policy "activity_logs_select_own" on public.activity_logs for select using (user_id = auth.uid());

-- BOT_SETTINGS
create policy "bot_settings_select_own" on public.bot_settings for select using (user_id = auth.uid());
create policy "bot_settings_update_own" on public.bot_settings for update using (user_id = auth.uid());

-- POSITIONS
create policy "positions_select_own"  on public.positions for select using (user_id = auth.uid());

-- TRADES
create policy "trades_select_own"     on public.trades for select using (user_id = auth.uid());

-- =============================================================================
-- SERVICE ROLE BYPASS
-- The Express API server and Edge Functions use the service role key which
-- automatically bypasses RLS. No additional policies needed for service role.
-- =============================================================================
