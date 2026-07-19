import { Router } from 'express';
import { db } from '@workspace/db';
import {
  profiles,
  orders,
  challengePlans,
  payouts,
  referralEarnings,
  activityLogs,
} from '@workspace/db/schema';
import { eq, desc, like, or, sql, and, lt } from 'drizzle-orm';
import { requireAdmin, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';

const router = Router();

// All admin routes require admin role
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// GET /v1/admin/stats
// ---------------------------------------------------------------------------
router.get('/v1/admin/stats', async (_req: Request, res: Response) => {
  try {
    const [totalUsersRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [usersTodayRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles)
      .where(sql`created_at >= ${today}`);

    const [activeUsersRow] = await db
      .select({ count: sql<number>`count(distinct user_id)::int` })
      .from(orders)
      .where(sql`created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}`);

    const [auditLogsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityLogs);

    res.json({
      total_users: totalUsersRow?.count ?? 0,
      users_today: usersTodayRow?.count ?? 0,
      active_users: activeUsersRow?.count ?? 0,
      audit_logs: auditLogsRow?.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/users
// ---------------------------------------------------------------------------
router.get('/v1/admin/users', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;

  try {
    let baseQuery = db.select().from(profiles);

    if (search) {
      const pattern = `%${search}%`;
      baseQuery = baseQuery.where(
        or(like(profiles.email, pattern), like(profiles.username ?? profiles.email, pattern)),
      ) as typeof baseQuery;
    }

    const [total, users] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(profiles),
      baseQuery.orderBy(desc(profiles.created_at)).limit(limit).offset(offset),
    ]);

    res.json({
      data: users.map(formatAdminUser),
      total: total[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/users/:userId
// ---------------------------------------------------------------------------
router.get('/v1/admin/users/:userId', async (req: Request, res: Response) => {
  try {
    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, Number(req.params.userId)));

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(formatAdminUser(user));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/orders
// ---------------------------------------------------------------------------
router.get('/v1/admin/orders', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  try {
    const [total, allOrders] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(orders),
      db.select().from(orders).orderBy(desc(orders.created_at)).limit(limit).offset(offset),
    ]);

    res.json({
      data: allOrders.map(formatOrder),
      total: total[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/admin/orders/expire-stale
// ---------------------------------------------------------------------------
router.post('/v1/admin/orders/expire-stale', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const result = await db
      .update(orders)
      .set({ status: 'expired', updated_at: now })
      .where(
        and(
          eq(orders.status, 'pending'),
          lt(orders.expiry_time, now),
        ),
      )
      .returning();

    res.json({ expired: result.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to expire stale orders' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/payouts
// ---------------------------------------------------------------------------
router.get('/v1/admin/payouts', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;

  try {
    let baseQuery = db.select().from(payouts);
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(payouts);

    if (statusFilter) {
      baseQuery = baseQuery.where(eq(payouts.status, statusFilter)) as typeof baseQuery;
      countQuery = countQuery.where(eq(payouts.status, statusFilter)) as typeof countQuery;
    }

    const allPayouts = await baseQuery.orderBy(desc(payouts.created_at)).limit(limit).offset(offset);

    // Return plain array so the frontend can use .map() and .length directly
    res.json(allPayouts.map(formatPayout));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/admin/payouts/:id/approve
// ---------------------------------------------------------------------------
router.post('/v1/admin/payouts/:id/approve', async (req: Request, res: Response) => {
  const { tx_signature } = req.body as { tx_signature: string };

  if (!tx_signature) {
    res.status(400).json({ error: 'tx_signature is required' });
    return;
  }

  try {
    const [payout] = await db
      .update(payouts)
      .set({ status: 'approved', tx_signature })
      .where(eq(payouts.id, Number(req.params.id)))
      .returning();

    if (!payout) {
      res.status(404).json({ error: 'Payout not found' });
      return;
    }

    res.json(formatPayout(payout));
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve payout' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/admin/payouts/:id/reject
// ---------------------------------------------------------------------------
router.post('/v1/admin/payouts/:id/reject', async (req: Request, res: Response) => {
  const { rejection_reason } = req.body as { rejection_reason: string };

  if (!rejection_reason) {
    res.status(400).json({ error: 'rejection_reason is required' });
    return;
  }

  try {
    const [payout] = await db
      .update(payouts)
      .set({ status: 'rejected', rejection_reason })
      .where(eq(payouts.id, Number(req.params.id)))
      .returning();

    if (!payout) {
      res.status(404).json({ error: 'Payout not found' });
      return;
    }

    res.json(formatPayout(payout));
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject payout' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/referrals
// ---------------------------------------------------------------------------
router.get('/v1/admin/referrals', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  try {
    const [total, earnings] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(referralEarnings),
      db
        .select()
        .from(referralEarnings)
        .orderBy(desc(referralEarnings.created_at))
        .limit(limit)
        .offset(offset),
    ]);

    res.json({
      data: earnings.map((e) => ({
        id: e.id,
        referrer_id: e.referrer_id,
        referred_user_id: e.referred_user_id,
        order_id: e.order_id ?? null,
        amount: Number(e.amount),
        status: e.status,
        created_at: e.created_at.toISOString(),
      })),
      total: total[0]?.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/audit-logs
// ---------------------------------------------------------------------------
router.get('/v1/admin/audit-logs', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  try {
    const logs = await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.created_at))
      .limit(limit)
      .offset(offset);

    res.json(
      logs.map((l) => ({
        id: l.id,
        user_id: l.user_id ?? null,
        action: l.action,
        details: l.details ?? null,
        created_at: l.created_at.toISOString(),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/challenge-plans — list all plans
// ---------------------------------------------------------------------------
router.get('/v1/admin/challenge-plans', async (_req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(challengePlans)
      .orderBy(challengePlans.display_order);

    res.json(plans.map(formatPlan));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/admin/challenge-plans — create plan
// ---------------------------------------------------------------------------
router.post('/v1/admin/challenge-plans', async (req: Request, res: Response) => {
  try {
    const [plan] = await db
      .insert(challengePlans)
      .values(req.body)
      .returning();

    res.json(formatPlan(plan));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /v1/admin/challenge-plans/:planId — update plan
// ---------------------------------------------------------------------------
router.patch('/v1/admin/challenge-plans/:planId', async (req: Request, res: Response) => {
  try {
    const [plan] = await db
      .update(challengePlans)
      .set({ ...req.body, updated_at: new Date() })
      .where(eq(challengePlans.id, Number(req.params.planId)))
      .returning();

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    res.json(formatPlan(plan));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/settings / POST /v1/admin/settings (stub)
// ---------------------------------------------------------------------------
router.get('/v1/admin/settings', (_req: Request, res: Response) => {
  res.json({ treasury_wallet: process.env.TREASURY_WALLET ?? '', sol_price_usd: 150 });
});

router.post('/v1/admin/settings', (_req: Request, res: Response) => {
  res.json({ message: 'Settings updated (restart server to apply env changes)' });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatAdminUser(p: typeof profiles.$inferSelect) {
  return {
    id: p.id,
    auth_user_id: p.auth_user_id,
    email: p.email,
    username: p.username ?? null,
    role: p.role,
    telegram_status: p.telegram_status ?? null,
    telegram_username: p.telegram_username ?? null,
    wallet_address: p.wallet_address ?? null,
    referral_code: p.referral_code ?? null,
    created_at: p.created_at.toISOString(),
  };
}

function formatOrder(o: typeof orders.$inferSelect) {
  return {
    id: o.id,
    user_id: o.user_id,
    challenge_plan_id: o.challenge_plan_id ?? null,
    status: o.status,
    amount: Number(o.amount),
    currency: o.currency,
    plan_name: o.plan_name ?? null,
    plan_slug: o.plan_slug ?? null,
    expected_sol: o.expected_sol != null ? Number(o.expected_sol) : null,
    sol_price_usd: o.sol_price_usd != null ? Number(o.sol_price_usd) : null,
    treasury_wallet: o.treasury_wallet ?? null,
    expiry_time: o.expiry_time?.toISOString() ?? null,
    payment_status: o.payment_status ?? null,
    tx_signature: o.tx_signature ?? null,
    created_at: o.created_at.toISOString(),
    updated_at: o.updated_at.toISOString(),
  };
}

function formatPayout(p: typeof payouts.$inferSelect) {
  return {
    id: p.id,
    user_id: p.user_id,
    amount: Number(p.amount),
    wallet_address: p.wallet_address,
    status: p.status,
    tx_signature: p.tx_signature ?? null,
    rejection_reason: p.rejection_reason ?? null,
    created_at: p.created_at.toISOString(),
  };
}

function formatPlan(p: typeof challengePlans.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price_usd: Number(p.price_usd),
    funded_sol: Number(p.funded_sol),
    funded_usd_estimate: p.funded_usd_estimate != null ? Number(p.funded_usd_estimate) : null,
    status: p.status,
    display_order: p.display_order,
    description: p.description ?? null,
    profit_target_pct: Number(p.profit_target_pct),
    max_drawdown_pct: Number(p.max_drawdown_pct),
    daily_drawdown_pct: Number(p.daily_drawdown_pct),
    min_trading_days: p.min_trading_days,
    max_position_size_pct: Number(p.max_position_size_pct),
    max_open_positions: p.max_open_positions,
    reactivation_cost_pct: Number(p.reactivation_cost_pct),
    created_at: p.created_at?.toISOString() ?? null,
    updated_at: p.updated_at?.toISOString() ?? null,
  };
}

export default router;
