import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

const APP_URL = process.env.APP_URL ?? 'https://fundedfrens.com';

// ---------------------------------------------------------------------------
// GET /v1/referrals/dashboard
// ---------------------------------------------------------------------------
router.get('/v1/referrals/dashboard', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const sb = supabaseAdmin();

  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('referral_code')
      .eq('auth_user_id', id)
      .single();

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const referralCode = profile.referral_code ?? id.slice(0, 8).toUpperCase();
    const referralLink = `${APP_URL}/register?ref=${referralCode}`;

    // Count registrations
    const { count: registrationsCount } = await sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', id);

    // Earnings
    const { data: earningRows } = await sb
      .from('referral_earnings')
      .select('*')
      .eq('referrer_id', id)
      .order('created_at', { ascending: false });

    const earnings = earningRows ?? [];
    const pendingEarningsUsd = earnings
      .filter((e) => e.status === 'pending')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const paidEarningsUsd = earnings
      .filter((e) => e.status === 'paid')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const qualifiedPurchasesCount = earnings.filter((e) => e.status !== 'cancelled').length;
    const totalEarningsUsd = pendingEarningsUsd + paidEarningsUsd;

    res.json({
      referral_code: referralCode,
      referral_link: referralLink,
      registrations_count: registrationsCount ?? 0,
      qualified_purchases_count: qualifiedPurchasesCount,
      pending_earnings_usd: pendingEarningsUsd,
      available_earnings_usd: pendingEarningsUsd,
      paid_earnings_usd: paidEarningsUsd,
      total_earnings_usd: totalEarningsUsd,
      history: earnings.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        status: e.status,
        created_at: e.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch referral dashboard' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/payouts — request payout
// ---------------------------------------------------------------------------
router.post('/v1/payouts', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const { amount, wallet_address } = req.body as { amount: number; wallet_address: string };

  if (!amount || !wallet_address) {
    res.status(400).json({ error: 'amount and wallet_address are required' });
    return;
  }

  try {
    const { data: payout, error } = await supabaseAdmin()
      .from('payouts')
      .insert({
        user_id: id,
        amount: String(amount),
        wallet_address,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    res.json(formatPayout(payout));
  } catch {
    res.status(500).json({ error: 'Failed to create payout request' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/payouts — list my payouts
// ---------------------------------------------------------------------------
router.get('/v1/payouts', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const { data: myPayouts, error } = await supabaseAdmin()
      .from('payouts')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json((myPayouts ?? []).map(formatPayout));
  } catch {
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function formatPayout(p: Record<string, unknown>) {
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
