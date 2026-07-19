import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  bigint,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// profiles — extends Supabase auth.users (linked by auth_user_id)
// ---------------------------------------------------------------------------
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  auth_user_id: text('auth_user_id').notNull().unique(),
  email: text('email').notNull(),
  username: text('username'),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  telegram_status: text('telegram_status').notNull().default('not_linked'),
  wallet_address: text('wallet_address'),
  referral_code: text('referral_code').unique(),
  referred_by: text('referred_by'), // auth_user_id of referrer
  // Telegram linking — added by bot migration 001
  telegram_id: bigint('telegram_id', { mode: 'number' }),
  telegram_link_token: text('telegram_link_token'),
  telegram_username: text('telegram_username'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// challenge_plans
// ---------------------------------------------------------------------------
export const challengePlans = pgTable('challenge_plans', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  price_usd: numeric('price_usd', { precision: 10, scale: 2 }).notNull(),
  funded_sol: numeric('funded_sol', { precision: 10, scale: 4 }).notNull(),
  funded_usd_estimate: numeric('funded_usd_estimate', { precision: 10, scale: 2 }),
  status: text('status').notNull().default('active'),
  display_order: integer('display_order').notNull().default(0),
  description: text('description'),
  profit_target_pct: numeric('profit_target_pct', { precision: 5, scale: 2 }).notNull(),
  max_drawdown_pct: numeric('max_drawdown_pct', { precision: 5, scale: 2 }).notNull(),
  daily_drawdown_pct: numeric('daily_drawdown_pct', { precision: 5, scale: 2 }).notNull(),
  min_trading_days: integer('min_trading_days').notNull(),
  max_position_size_pct: numeric('max_position_size_pct', { precision: 5, scale: 2 }).notNull(),
  max_open_positions: integer('max_open_positions').notNull(),
  reactivation_cost_pct: numeric('reactivation_cost_pct', { precision: 5, scale: 2 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// user_challenges
// ---------------------------------------------------------------------------
export const userChallenges = pgTable('user_challenges', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull(), // auth_user_id
  challenge_plan_id: integer('challenge_plan_id').notNull(),
  order_id: integer('order_id'),
  status: text('status').notNull().default('pending'),
  started_at: timestamp('started_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  failed_at: timestamp('failed_at', { withTimezone: true }),
  profit_target_pct: numeric('profit_target_pct', { precision: 5, scale: 2 }),
  max_drawdown_pct: numeric('max_drawdown_pct', { precision: 5, scale: 2 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull(), // auth_user_id
  challenge_plan_id: integer('challenge_plan_id'),
  status: text('status').notNull().default('pending'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  plan_name: text('plan_name'),
  plan_slug: text('plan_slug'),
  expected_sol: numeric('expected_sol', { precision: 10, scale: 6 }),
  sol_price_usd: numeric('sol_price_usd', { precision: 10, scale: 2 }),
  treasury_wallet: text('treasury_wallet'),
  expiry_time: timestamp('expiry_time', { withTimezone: true }),
  payment_status: text('payment_status'),
  tx_signature: text('tx_signature'),
  received_sol: numeric('received_sol', { precision: 10, scale: 6 }),
  referral_code: text('referral_code'),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// referral_earnings
// ---------------------------------------------------------------------------
export const referralEarnings = pgTable('referral_earnings', {
  id: serial('id').primaryKey(),
  referrer_id: text('referrer_id').notNull(), // auth_user_id
  referred_user_id: text('referred_user_id').notNull(),
  order_id: integer('order_id'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// payouts
// ---------------------------------------------------------------------------
export const payouts = pgTable('payouts', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull(), // auth_user_id
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  wallet_address: text('wallet_address').notNull(),
  status: text('status').notNull().default('pending'),
  tx_signature: text('tx_signature'),
  rejection_reason: text('rejection_reason'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// activity_logs
// ---------------------------------------------------------------------------
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  user_id: text('user_id'),
  action: text('action').notNull(),
  details: text('details'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Insert schemas (Zod, for validation in route handlers)
// ---------------------------------------------------------------------------
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, created_at: true, updated_at: true });
export const insertChallengePlanSchema = createInsertSchema(challengePlans).omit({ id: true, created_at: true, updated_at: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, created_at: true, updated_at: true });
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, created_at: true });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type ChallengePlan = typeof challengePlans.$inferSelect;
export type InsertChallengePlan = typeof challengePlans.$inferInsert;
export type UserChallenge = typeof userChallenges.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type ReferralEarning = typeof referralEarnings.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
