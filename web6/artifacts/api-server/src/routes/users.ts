import { Router } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get or create profile for a Supabase user
// ---------------------------------------------------------------------------
async function getOrCreateProfile(userId: string, email: string) {
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', userId)
    .single();

  if (existing) return existing;

  // Generate unique referral code
  const referralCode = userId.slice(0, 8).toUpperCase();

  const { data: created, error } = await sb
    .from('profiles')
    .insert({
      auth_user_id: userId,
      email,
      role: 'user',
      telegram_status: 'not_linked',
      referral_code: referralCode,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return created;
}

function formatProfile(p: Record<string, unknown>) {
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

// ---------------------------------------------------------------------------
// GET /v1/users/profile
// ---------------------------------------------------------------------------
router.get('/v1/users/profile', requireAuth, async (req: Request, res: Response) => {
  const { id, email } = (req as AuthenticatedRequest).authUser;

  try {
    const profile = await getOrCreateProfile(id, email);
    res.json(formatProfile(profile));
  } catch {
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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (username !== undefined) updates.username = username;
    if (wallet_address !== undefined) updates.wallet_address = wallet_address;

    const { data: updated, error } = await supabaseAdmin()
      .from('profiles')
      .update(updates)
      .eq('auth_user_id', id)
      .select()
      .single();

    if (error || !updated) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(formatProfile(updated));
  } catch {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/users/dashboard
// ---------------------------------------------------------------------------
router.get('/v1/users/dashboard', requireAuth, async (req: Request, res: Response) => {
  const { id, email } = (req as AuthenticatedRequest).authUser;
  const sb = supabaseAdmin();

  try {
    const profile = await getOrCreateProfile(id, email);

    // Count referrals
    const { count: referralCount } = await sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', id);

    // Active/latest challenge
    const { data: challenges } = await sb
      .from('user_challenges')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    const activeChallenge = challenges?.find((c) => c.status === 'active') ?? null;

    // Trading stats from positions/trades (used by bot too)
    const { data: closedTrades } = await sb
      .from('trades')
      .select('pnl_sol, pnl_pct, amount_sol, side, created_at')
      .eq('user_id', id)
      .eq('side', 'sell')
      .order('created_at', { ascending: false });

    const { data: openPositions } = await sb
      .from('positions')
      .select('*')
      .eq('user_id', id)
      .eq('status', 'open');

    const trades = closedTrades ?? [];
    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => Number(t.pnl_sol ?? 0) > 0).length;
    const losingTrades = trades.filter((t) => Number(t.pnl_sol ?? 0) < 0).length;
    const totalPnl = trades.reduce((sum, t) => sum + Number(t.pnl_sol ?? 0), 0);
    const realizedPnl = totalPnl;

    const bestTrade = trades.reduce(
      (best, t) => (Number(t.pnl_sol ?? 0) > Number(best?.pnl_sol ?? -Infinity) ? t : best),
      null as (typeof trades)[0] | null
    );
    const worstTrade = trades.reduce(
      (worst, t) => (Number(t.pnl_sol ?? 0) < Number(worst?.pnl_sol ?? Infinity) ? t : worst),
      null as (typeof trades)[0] | null
    );

    const wins = trades.filter((t) => Number(t.pnl_sol ?? 0) > 0);
    const losses = trades.filter((t) => Number(t.pnl_sol ?? 0) < 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + Number(t.pnl_sol ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + Number(t.pnl_sol ?? 0), 0) / losses.length : 0;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Unrealized PnL from open positions
    const unrealizedPnl = (openPositions ?? []).reduce((sum, p) => {
      const invested = Number(p.amount_sol_invested ?? 0);
      return sum + invested * 0; // Real-time PnL requires live price; bot handles this
    }, 0);

    // Referral earnings
    const { data: referralEarnings } = await sb
      .from('referral_earnings')
      .select('amount, status')
      .eq('referrer_id', id);

    const pendingEarnings = (referralEarnings ?? [])
      .filter((e) => e.status === 'pending')
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalEarnings = (referralEarnings ?? []).reduce((s, e) => s + Number(e.amount), 0);

    // Payouts
    const { data: myPayouts } = await sb
      .from('payouts')
      .select('amount, status')
      .eq('user_id', id);

    const pendingPayouts = (myPayouts ?? [])
      .filter((p) => p.status === 'pending')
      .reduce((s, p) => s + Number(p.amount), 0);
    const completedPayouts = (myPayouts ?? [])
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + Number(p.amount), 0);

    const referralLink = `${process.env.APP_URL ?? 'https://fundedfrens.com'}/register?ref=${profile.referral_code ?? id.slice(0, 8).toUpperCase()}`;

    res.json({
      profile: formatProfile(profile),
      challenge: activeChallenge,
      performance: {
        total_pnl: totalPnl,
        realized_pnl: realizedPnl,
        unrealized_pnl: unrealizedPnl,
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        best_trade: bestTrade ? Number(bestTrade.pnl_sol) : null,
        worst_trade: worstTrade ? Number(worstTrade.pnl_sol) : null,
        avg_win: avgWin,
        avg_loss: avgLoss,
      },
      trading: {
        open_positions: openPositions?.length ?? 0,
        positions: openPositions ?? [],
      },
      referrals: {
        referral_code: profile.referral_code ?? id.slice(0, 8).toUpperCase(),
        referral_link: referralLink,
        total_referrals: referralCount ?? 0,
        successful_referrals: (referralEarnings ?? []).filter((e) => e.status !== 'cancelled').length,
        total_earnings_usd: totalEarnings,
        pending_earnings_usd: pendingEarnings,
      },
      payouts: {
        wallet_address: profile.wallet_address ?? null,
        available_profit: pendingEarnings,
        pending_payouts: pendingPayouts,
        completed_payouts: completedPayouts,
      },
      telegram: {
        status: profile.telegram_status,
        username: profile.telegram_username ?? null,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/users/challenges — list my challenges
// ---------------------------------------------------------------------------
router.get('/v1/users/challenges', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const { data: challenges, error } = await supabaseAdmin()
      .from('user_challenges')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(challenges ?? []);
  } catch {
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/users/telegram — generate Telegram linking token
// ---------------------------------------------------------------------------
router.post('/v1/users/telegram', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const token = randomBytes(4).toString('hex').toUpperCase(); // 8-char token
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const { data: updated, error } = await supabaseAdmin()
      .from('profiles')
      .update({
        telegram_link_token: token,
        telegram_link_token_exp: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', id)
      .select()
      .single();

    if (error || !updated) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json({
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to generate Telegram token' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /v1/users/telegram — unlink Telegram account
// ---------------------------------------------------------------------------
router.delete('/v1/users/telegram', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const { data: updated, error } = await supabaseAdmin()
      .from('profiles')
      .update({
        telegram_id: null,
        telegram_link_token: null,
        telegram_link_token_exp: null,
        telegram_username: null,
        telegram_status: 'not_linked',
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', id)
      .select()
      .single();

    if (error || !updated) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(formatProfile(updated));
  } catch {
    res.status(500).json({ error: 'Failed to unlink Telegram' });
  }
});

export default router;
