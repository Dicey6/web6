import { Router } from 'express';
import { randomBytes } from 'crypto';
import { db } from '@workspace/db';
import { profiles, userChallenges, challengePlans, activityLogs } from '@workspace/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get or create profile for a Supabase user
// ---------------------------------------------------------------------------
async function getOrCreateProfile(userId: string, email: string) {
  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.auth_user_id, userId));

  if (existing) return existing;

  // Generate unique referral code
  const referralCode = userId.slice(0, 8).toUpperCase();

  const [created] = await db
    .insert(profiles)
    .values({
      auth_user_id: userId,
      email,
      role: 'user',
      telegram_status: 'not_linked',
      referral_code: referralCode,
    })
    .returning();

  return created;
}

function formatProfile(p: typeof profiles.$inferSelect) {
  return {
    id: p.id,
    auth_user_id: p.auth_user_id,
    email: p.email,
    username: p.username ?? null,
    role: p.role,
    telegram_status: p.telegram_status,
    telegram_username: p.telegram_username ?? null,
    wallet_address: p.wallet_address ?? null,
    referral_code: p.referral_code ?? null,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /v1/users/profile
// ---------------------------------------------------------------------------
router.get('/v1/users/profile', requireAuth, async (req: Request, res: Response) => {
  const { id, email } = (req as AuthenticatedRequest).authUser;

  try {
    const profile = await getOrCreateProfile(id, email);
    res.json(formatProfile(profile));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /v1/users/profile
// ---------------------------------------------------------------------------
router.patch('/v1/users/profile', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const { username, wallet_address } = req.body as { username?: string; wallet_address?: string };

  try {
    const updates: Partial<typeof profiles.$inferInsert> = { updated_at: new Date() };
    if (username !== undefined) updates.username = username;
    if (wallet_address !== undefined) updates.wallet_address = wallet_address;

    const [updated] = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.auth_user_id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(formatProfile(updated));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/users/dashboard
// ---------------------------------------------------------------------------
router.get('/v1/users/dashboard', requireAuth, async (req: Request, res: Response) => {
  const { id, email } = (req as AuthenticatedRequest).authUser;

  try {
    const profile = await getOrCreateProfile(id, email);

    // Count referrals
    const [referralCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles)
      .where(eq(profiles.referred_by, id));

    const referralCount = referralCountRow?.count ?? 0;

    // Active challenge status (if any)
    const [activeChallenge] = await db
      .select({ status: userChallenges.status })
      .from(userChallenges)
      .where(eq(userChallenges.user_id, id))
      .orderBy(desc(userChallenges.created_at))
      .limit(1);

    // Recent activity
    const recentActivity = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.user_id, id))
      .orderBy(desc(activityLogs.created_at))
      .limit(10);

    res.json({
      profile: formatProfile(profile),
      challenge_status: activeChallenge?.status ?? null,
      referral_code: profile.referral_code ?? null,
      referral_count: referralCount,
      recent_activity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        details: a.details ?? null,
        created_at: a.created_at.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/my/challenges
// ---------------------------------------------------------------------------
router.get('/v1/my/challenges', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const challenges = await db
      .select({
        challenge: userChallenges,
        plan: challengePlans,
      })
      .from(userChallenges)
      .leftJoin(challengePlans, eq(userChallenges.challenge_plan_id, challengePlans.id))
      .where(eq(userChallenges.user_id, id))
      .orderBy(desc(userChallenges.created_at));

    res.json(
      challenges.map(({ challenge, plan }) => ({
        id: challenge.id,
        user_id: challenge.user_id,
        challenge_plan_id: challenge.challenge_plan_id,
        order_id: challenge.order_id ?? null,
        status: challenge.status,
        started_at: challenge.started_at?.toISOString() ?? null,
        expires_at: challenge.expires_at?.toISOString() ?? null,
        completed_at: challenge.completed_at?.toISOString() ?? null,
        failed_at: challenge.failed_at?.toISOString() ?? null,
        profit_target_pct: challenge.profit_target_pct != null ? Number(challenge.profit_target_pct) : null,
        max_drawdown_pct: challenge.max_drawdown_pct != null ? Number(challenge.max_drawdown_pct) : null,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              slug: plan.slug,
              price_usd: Number(plan.price_usd),
              funded_sol: Number(plan.funded_sol),
              funded_usd_estimate: plan.funded_usd_estimate != null ? Number(plan.funded_usd_estimate) : null,
              status: plan.status,
              display_order: plan.display_order,
              description: plan.description ?? null,
              profit_target_pct: Number(plan.profit_target_pct),
              max_drawdown_pct: Number(plan.max_drawdown_pct),
              daily_drawdown_pct: Number(plan.daily_drawdown_pct),
              min_trading_days: plan.min_trading_days,
              max_position_size_pct: Number(plan.max_position_size_pct),
              max_open_positions: plan.max_open_positions,
              reactivation_cost_pct: Number(plan.reactivation_cost_pct),
              created_at: plan.created_at?.toISOString() ?? null,
              updated_at: plan.updated_at?.toISOString() ?? null,
            }
          : undefined,
        created_at: challenge.created_at.toISOString(),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/users/telegram/token — generate a one-time Telegram link token
// ---------------------------------------------------------------------------
router.post('/v1/users/telegram/token', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    // Generate 8-char uppercase alphanumeric token
    const token = randomBytes(6)
      .toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 8)
      .padEnd(8, 'X');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    const [updated] = await db
      .update(profiles)
      .set({
        telegram_link_token: token,
        // updated_at is intentionally set here — the bot uses it to check token age (10-min window)
        updated_at: now,
      })
      .where(eq(profiles.auth_user_id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json({
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate Telegram token' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /v1/users/telegram — unlink Telegram account
// ---------------------------------------------------------------------------
router.delete('/v1/users/telegram', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const [updated] = await db
      .update(profiles)
      .set({
        telegram_id: null,
        telegram_link_token: null,
        telegram_username: null,
        telegram_status: 'not_linked',
        updated_at: new Date(),
      })
      .where(eq(profiles.auth_user_id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(formatProfile(updated));
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink Telegram' });
  }
});

export default router;
