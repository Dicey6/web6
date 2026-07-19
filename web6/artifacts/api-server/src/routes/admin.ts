import { Router } from 'express';
import { requireAdmin, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

// All admin routes require admin role
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// GET /v1/admin/stats
// ---------------------------------------------------------------------------
router.get('/v1/admin/stats', async (_req: Request, res: Response) => {
  const sb = supabaseAdmin();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      { count: totalUsers },
      { count: usersToday },
      { count: activeUsers },
      { count: auditLogs },
      { count: totalOrders },
      { count: confirmedOrders },
      { data: revenue },
    ] = await Promise.all([
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      sb.from('orders').select('user_id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo.toISOString()),
      sb.from('activity_logs').select('*', { count: 'exact', head: true }),
      sb.from('orders').select('*', { count: 'exact', head: true }),
      sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
      sb.from('orders').select('amount').eq('status', 'confirmed'),
    ]);

    const totalRevenue = (revenue ?? []).reduce((s, o) => s + Number(o.amount), 0);

    res.json({
      total_users: totalUsers ?? 0,
      users_today: usersToday ?? 0,
      active_users: activeUsers ?? 0,
      audit_logs: auditLogs ?? 0,
      total_orders: totalOrders ?? 0,
      confirmed_orders: confirmedOrders ?? 0,
      total_revenue_usd: totalRevenue,
    });
  } catch {
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
  const sb = supabaseAdmin();

  try {
    let query = sb.from('profiles').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%`);
    }

    const { data: users, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: (users ?? []).map(formatAdminUser),
      total: count ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/users/:userId — single user details
// ---------------------------------------------------------------------------
router.get('/v1/admin/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const sb = supabaseAdmin();

  try {
    const [{ data: profile }, { data: challenges }, { data: orders }, { data: payouts }] = await Promise.all([
      sb.from('profiles').select('*').eq('auth_user_id', userId).single(),
      sb.from('user_challenges').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      sb.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      sb.from('payouts').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      profile: formatAdminUser(profile),
      challenges: challenges ?? [],
      orders: (orders ?? []).map(formatAdminOrder),
      payouts: (payouts ?? []).map(formatAdminPayout),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /v1/admin/users/:userId — update user role
// ---------------------------------------------------------------------------
router.patch('/v1/admin/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { role } = req.body as { role?: string };

  try {
    const { data: updated, error } = await supabaseAdmin()
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('auth_user_id', userId)
      .select()
      .single();

    if (error || !updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(formatAdminUser(updated));
  } catch {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/orders
// ---------------------------------------------------------------------------
router.get('/v1/admin/orders', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const sb = supabaseAdmin();

  try {
    let query = sb.from('orders').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);

    const { data: orders, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: (orders ?? []).map(formatAdminOrder),
      total: count ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/payouts
// ---------------------------------------------------------------------------
router.get('/v1/admin/payouts', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const sb = supabaseAdmin();

  try {
    let query = sb.from('payouts').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);

    const { data: payouts, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: (payouts ?? []).map(formatAdminPayout),
      total: count ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /v1/admin/payouts/:payoutId — approve or reject payout
// ---------------------------------------------------------------------------
router.patch('/v1/admin/payouts/:payoutId', async (req: Request, res: Response) => {
  const payoutId = Number(req.params.payoutId);
  const { status, tx_signature, rejection_reason } = req.body as {
    status?: string;
    tx_signature?: string;
    rejection_reason?: string;
  };

  if (isNaN(payoutId)) {
    res.status(400).json({ error: 'Invalid payout ID' });
    return;
  }

  try {
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (tx_signature) updates.tx_signature = tx_signature;
    if (rejection_reason) updates.rejection_reason = rejection_reason;

    const { data: updated, error } = await supabaseAdmin()
      .from('payouts')
      .update(updates)
      .eq('id', payoutId)
      .select()
      .single();

    if (error || !updated) {
      res.status(404).json({ error: 'Payout not found' });
      return;
    }

    res.json(formatAdminPayout(updated));
  } catch {
    res.status(500).json({ error: 'Failed to update payout' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/audit-logs
// ---------------------------------------------------------------------------
router.get('/v1/admin/audit-logs', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  try {
    const { data: logs, count, error } = await supabaseAdmin()
      .from('activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: logs ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/challenges
// ---------------------------------------------------------------------------
router.get('/v1/admin/challenges', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  try {
    const { data: challenges, count, error } = await supabaseAdmin()
      .from('user_challenges')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: challenges ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function formatAdminUser(p: Record<string, unknown>) {
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
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

function formatAdminOrder(o: Record<string, unknown>) {
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
    expiry_time: o.expiry_time ?? null,
    payment_status: o.payment_status ?? null,
    tx_signature: o.tx_signature ?? null,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

function formatAdminPayout(p: Record<string, unknown>) {
  return {
    id: p.id,
    user_id: p.user_id,
    amount: Number(p.amount),
    wallet_address: p.wallet_address,
    status: p.status,
    tx_signature: p.tx_signature ?? null,
    rejection_reason: p.rejection_reason ?? null,
    created_at: p.created_at,
  };
}

export default router;
