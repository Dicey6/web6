import { Router } from 'express';
import { db } from '@workspace/db';
import { orders, userChallenges, referralEarnings, profiles, activityLogs } from '@workspace/db/schema';
import { eq, and, desc, ne, isNotNull } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';
import { getSolPrice } from '../lib/solPrice.js';
import { findPaymentForOrder } from '../lib/helius.js';
import { HARDCODED_PLANS } from './plans.js';

const router = Router();

const TREASURY_WALLET = process.env.TREASURY_WALLET ?? '';
const REFERRAL_COMMISSION_PCT = 20;

// ---------------------------------------------------------------------------
// POST /v1/orders — create order with live SOL price
// ---------------------------------------------------------------------------
router.post('/v1/orders', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const { challenge_plan_id, referral_code } = req.body as {
    challenge_plan_id: number;
    referral_code?: string;
  };

  if (!challenge_plan_id) {
    res.status(400).json({ error: 'challenge_plan_id is required' });
    return;
  }

  const plan = HARDCODED_PLANS.find((p) => p.id === challenge_plan_id);
  if (!plan) {
    res.status(404).json({ error: 'Challenge plan not found' });
    return;
  }

  try {
    const solPrice = await getSolPrice();
    const expectedSol = parseFloat((plan.price_usd / solPrice).toFixed(6));
    const expiryTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const [order] = await db
      .insert(orders)
      .values({
        user_id: id,
        challenge_plan_id: plan.id,
        status: 'pending',
        amount: String(plan.price_usd),
        currency: 'USD',
        plan_name: plan.name,
        plan_slug: plan.slug,
        expected_sol: String(expectedSol),
        sol_price_usd: String(solPrice.toFixed(2)),
        treasury_wallet: TREASURY_WALLET,
        expiry_time: expiryTime,
        payment_status: 'awaiting_payment',
        referral_code: referral_code ?? null,
      })
      .returning();

    res.json(formatOrder(order));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/orders — list my orders
// ---------------------------------------------------------------------------
router.get('/v1/orders', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  try {
    const myOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.user_id, id))
      .orderBy(desc(orders.created_at))
      .limit(limit)
      .offset(offset);

    res.json(myOrders.map(formatOrder));
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/orders/:orderId — get specific order
// ---------------------------------------------------------------------------
router.get('/v1/orders/:orderId', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const orderId = Number(req.params.orderId);

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.user_id, id)));

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(formatOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:orderId/cancel — cancel a pending order
// ---------------------------------------------------------------------------
router.post('/v1/orders/:orderId/cancel', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const orderId = Number(req.params.orderId);

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.user_id, id)));

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status !== 'pending') {
      res.status(400).json({ error: 'Only pending orders can be cancelled' });
      return;
    }

    const [cancelled] = await db
      .update(orders)
      .set({ status: 'cancelled', updated_at: new Date() })
      .where(eq(orders.id, orderId))
      .returning();

    res.json(formatOrder(cancelled));
  } catch {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/orders/:orderId/payment-status
// Polls payment status AND triggers automatic on-chain verification via Helius
// when the order is still pending. No user action required.
// ---------------------------------------------------------------------------
router.get('/v1/orders/:orderId/payment-status', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const orderId = Number(req.params.orderId);

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  try {
    let [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.user_id, id)));

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const now = new Date();

    // 1. Auto-expire stale pending orders
    if (order.status === 'pending' && order.expiry_time && new Date(order.expiry_time) < now) {
      const [expired] = await db
        .update(orders)
        .set({ status: 'expired', payment_status: 'expired', updated_at: now })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
        .returning();
      if (expired) order = expired;
    }

    // 2. Attempt on-chain verification only for pending orders
    if (
      order.status === 'pending' &&
      order.treasury_wallet &&
      order.expected_sol &&
      order.expiry_time
    ) {
      try {
        // Collect all tx_signatures already claimed by other orders (replay-attack prevention)
        const claimedSigs = await db
          .select({ tx_signature: orders.tx_signature })
          .from(orders)
          .where(and(isNotNull(orders.tx_signature), ne(orders.id, orderId)));

        const existingTxSignatures = claimedSigs
          .map((r) => r.tx_signature)
          .filter(Boolean) as string[];

        const result = await findPaymentForOrder({
          treasuryWallet: order.treasury_wallet,
          expectedSol: Number(order.expected_sol),
          orderCreatedAt: order.created_at,
          expiryTime: new Date(order.expiry_time),
          existingTxSignatures,
        });

        if (result.found && result.signature) {
          // Atomic conditional update — only succeeds if status is still 'pending'
          // This prevents double-activation if two poll requests race.
          const [activated] = await db
            .update(orders)
            .set({
              status: 'activated',
              payment_status: 'confirmed',
              tx_signature: result.signature,
              received_sol: result.receivedSol != null
                ? String(result.receivedSol.toFixed(6))
                : null,
              confirmed_at: now,
              updated_at: now,
            })
            .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
            .returning();

          if (activated) {
            order = activated;
            // Run activation side-effects (best-effort — do not fail the response)
            activatePurchase(order, id).catch(() => {});
          }
        }
      } catch {
        // Helius call failed — don't crash the polling response; just return current status
      }
    }

    const expiryTime = order.expiry_time ? new Date(order.expiry_time) : null;
    const secondsRemaining =
      expiryTime && expiryTime > now
        ? Math.floor((expiryTime.getTime() - now.getTime()) / 1000)
        : null;

    res.json({
      order_id: order.id,
      order_status: order.status,
      payment_status: order.payment_status ?? 'awaiting_payment',
      expected_sol: order.expected_sol != null ? Number(order.expected_sol) : null,
      received_sol: order.received_sol != null ? Number(order.received_sol) : null,
      treasury_wallet: order.treasury_wallet ?? null,
      tx_signature: order.tx_signature ?? null,
      expiry_time: order.expiry_time?.toISOString() ?? null,
      confirmed_at: order.confirmed_at?.toISOString() ?? null,
      seconds_remaining: secondsRemaining,
      challenge_activated: order.status === 'activated',
    });
  } catch {
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ---------------------------------------------------------------------------
// Activation side-effects (run after payment is confirmed)
// Creates user_challenge record, credits referral, logs activity.
// ---------------------------------------------------------------------------
async function activatePurchase(
  order: typeof orders.$inferSelect,
  userId: string,
): Promise<void> {
  const now = new Date();

  // Create user challenge
  if (order.challenge_plan_id) {
    const plan = HARDCODED_PLANS.find((p) => p.id === order.challenge_plan_id);
    await db.insert(userChallenges).values({
      user_id: userId,
      challenge_plan_id: order.challenge_plan_id,
      order_id: order.id,
      status: 'active',
      started_at: now,
      profit_target_pct: plan ? String(plan.profit_target_pct) : null,
      max_drawdown_pct: plan ? String(plan.max_drawdown_pct) : null,
    });
  }

  // Credit referral commission (20%) if a referral code was used
  if (order.referral_code) {
    const [referrer] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.referral_code, order.referral_code))
      .limit(1);

    if (referrer && referrer.auth_user_id !== userId) {
      const commissionAmount = (Number(order.amount) * REFERRAL_COMMISSION_PCT) / 100;
      await db.insert(referralEarnings).values({
        referrer_id: referrer.auth_user_id,
        referred_user_id: userId,
        order_id: order.id,
        amount: String(commissionAmount.toFixed(2)),
        status: 'pending',
      });
    }
  }

  // Activity log
  await db.insert(activityLogs).values({
    user_id: userId,
    action: 'challenge_activated',
    details: `Order #${order.id} auto-confirmed on-chain — tx: ${order.tx_signature}`,
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
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
    received_sol: o.received_sol != null ? Number(o.received_sol) : null,
    sol_price_usd: o.sol_price_usd != null ? Number(o.sol_price_usd) : null,
    treasury_wallet: o.treasury_wallet ?? null,
    expiry_time: o.expiry_time?.toISOString() ?? null,
    payment_status: o.payment_status ?? null,
    tx_signature: o.tx_signature ?? null,
    created_at: o.created_at.toISOString(),
    updated_at: o.updated_at.toISOString(),
  };
}

export default router;
