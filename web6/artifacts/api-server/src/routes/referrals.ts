import { Router } from 'express';
import { db } from '@workspace/db';
import { profiles, referralEarnings, payouts } from '@workspace/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';

const router = Router();

const APP_URL = process.env.APP_URL ?? 'https://fundedfrens.com';

// ---------------------------------------------------------------------------
// GET /v1/referrals/dashboard
// ---------------------------------------------------------------------------
router.get('/v1/referrals/dashboard', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.auth_user_id, id));

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const referralCode = profile.referral_code ?? id.slice(0, 8).toUpperCase();
    const referralLink = `${APP_URL}/register?ref=${referralCode}`;

    // Count registrations (users who signed up via this referral code)
    const [regRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles)
      .where(eq(profiles.referred_by, id));

    const registrationsCount = regRow?.count ?? 0;

    // Earnings summary
    const earningRows = await db
      .select()
      .from(referralEarnings)
      .where(eq(referralEarnings.referrer_id, id))
      .orderBy(desc(referralEarnings.created_at));

    const pendingEarningsUsd = earningRows
      .filter((e) => e.status === 'pending')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const paidEarningsUsd = earningRows
      .filter((e) => e.status === 'paid')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const qualifiedPurchasesCount = earningRows.filter((e) => e.status !== 'cancelled').length;

    const totalEarningsUsd = pendingEarningsUsd + paidEarningsUsd;

    res.json({
      referral_code: referralCode,
      referral_link: referralLink,
      registrations_count: registrationsCount,
      qualified_purchases_count: qualifiedPurchasesCount,
      pending_earnings_usd: pendingEarningsUsd,
      available_earnings_usd: pendingEarningsUsd,
      paid_earnings_usd: paidEarningsUsd,
      total_earnings_usd: totalEarningsUsd,
      history: earningRows.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        status: e.status,
        created_at: e.created_at.toISOString(),
      })),
    });
  } catch (err) {
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
    const [payout] = await db
      .insert(payouts)
      .values({
        user_id: id,
        amount: String(amount),
        wallet_address,
        status: 'pending',
      })
      .returning();

    res.json(formatPayout(payout));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create payout request' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/payouts — list my payouts
// ---------------------------------------------------------------------------
router.get('/v1/payouts', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;

  try {
    const myPayouts = await db
      .select()
      .from(payouts)
      .where(eq(payouts.user_id, id))
      .orderBy(desc(payouts.created_at));

    res.json(myPayouts.map(formatPayout));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
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

export default router;
