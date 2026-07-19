import { Router } from 'express';
import { db } from '@workspace/db';
import { orders, challengePlans, userChallenges, referralEarnings, profiles, activityLogs } from '@workspace/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';

const router = Router();

const TREASURY_WALLET = process.env.TREASURY_WALLET ?? '';
const SOL_PRICE_USD = 150; // Fallback; ideally fetched from an oracle
const REFERRAL_COMMISSION_PCT = 20; // 20% commission on first purchase

// ---------------------------------------------------------------------------
// POST /v1/orders — create order and generate SOL payment details
// ---------------------------------------------------------------------------
router.post('/v1/orders', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const { challenge_plan_id, referral_code } = req.body as { challenge_plan_id: number; referral_code?: string };

  if (!challenge_plan_id) {
    res.status(400).json({ error: 'challenge_plan_id is required' });
    return;
  }

  try {
    const [plan] = await db
      .select()
      .from(challengePlans)
      .where(eq(challengePlans.id, challenge_plan_id));

    if (!plan) {
      res.status(404).json({ error: 'Challenge plan not found' });
      return;
    }

    const priceUsd = Number(plan.price_usd);
    const expectedSol = priceUsd / SOL_PRICE_USD;
    const expiryTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const [order] = await db
      .insert(orders)
      .values({
        user_id: id,
        challenge_plan_id: plan.id,
        status: 'pending',
        amount: String(priceUsd),
        currency: 'USD',
        plan_name: plan.name,
        plan_slug: plan.slug,
        expected_sol: String(expectedSol.toFixed(6)),
        sol_price_usd: String(SOL_PRICE_USD),
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
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/orders/:orderId/payment-status — poll payment status
// Returns the format the frontend expects (order_status, challenge_activated, etc.)
// ---------------------------------------------------------------------------
router.get('/v1/orders/:orderId/payment-status', requireAuth, async (req: Request, res: Response) => {
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

    const now = new Date();
    let orderStatus = order.status;

    // Auto-expire stale orders
    if (order.expiry_time && new Date(order.expiry_time) < now && orderStatus === 'pending') {
      const [expired] = await db
        .update(orders)
        .set({ status: 'expired', updated_at: now })
        .where(eq(orders.id, orderId))
        .returning();
      orderStatus = expired.status;
    }

    const expiryTime = order.expiry_time ? new Date(order.expiry_time) : null;
    const secondsRemaining = expiryTime && expiryTime > now
      ? Math.floor((expiryTime.getTime() - now.getTime()) / 1000)
      : null;

    const challengeActivated = orderStatus === 'activated';

    res.json({
      order_id: order.id,
      order_status: orderStatus,
      payment_status: order.payment_status ?? 'awaiting_payment',
      expected_sol: order.expected_sol != null ? Number(order.expected_sol) : null,
      received_sol: null, // populated when on-chain verification is added
      treasury_wallet: order.treasury_wallet ?? null,
      tx_signature: order.tx_signature ?? null,
      expiry_time: order.expiry_time?.toISOString() ?? null,
      confirmed_at: order.confirmed_at?.toISOString() ?? null,
      seconds_remaining: secondsRemaining,
      challenge_activated: challengeActivated,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:orderId/confirm — manually confirm payment
// Admin / webhook: provide tx_signature → activates challenge + credits referral
// ---------------------------------------------------------------------------
router.post('/v1/orders/:orderId/confirm', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const orderId = Number(req.params.orderId);
  const { tx_signature } = req.body as { tx_signature: string };

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }
  if (!tx_signature) {
    res.status(400).json({ error: 'tx_signature is required' });
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

    if (order.status === 'activated') {
      res.status(409).json({ error: 'Order already activated' });
      return;
    }

    if (order.status === 'cancelled' || order.status === 'expired') {
      res.status(400).json({ error: `Cannot confirm a ${order.status} order` });
      return;
    }

    const now = new Date();

    // 1. Mark order as activated
    const [activatedOrder] = await db
      .update(orders)
      .set({
        status: 'activated',
        payment_status: 'confirmed',
        tx_signature,
        confirmed_at: now,
        updated_at: now,
      })
      .where(eq(orders.id, orderId))
      .returning();

    // 2. Create user_challenge — activate the funded account
    if (order.challenge_plan_id) {
      const [plan] = await db
        .select()
        .from(challengePlans)
        .where(eq(challengePlans.id, order.challenge_plan_id));

      await db.insert(userChallenges).values({
        user_id: id,
        challenge_plan_id: order.challenge_plan_id,
        order_id: order.id,
        status: 'active',
        started_at: now,
        profit_target_pct: plan?.profit_target_pct ?? null,
        max_drawdown_pct: plan?.max_drawdown_pct ?? null,
      });
    }

    // 3. Credit referral commission if a referral code was used
    if (order.referral_code) {
      const [referrer] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.referral_code, order.referral_code))
        .limit(1);

      if (referrer && referrer.auth_user_id !== id) {
        const commissionAmount = (Number(order.amount) * REFERRAL_COMMISSION_PCT) / 100;

        await db.insert(referralEarnings).values({
          referrer_id: referrer.auth_user_id,
          referred_user_id: id,
          order_id: order.id,
          amount: String(commissionAmount.toFixed(2)),
          status: 'pending',
        });
      }
    }

    // 4. Log the activation
    await db.insert(activityLogs).values({
      user_id: id,
      action: 'challenge_activated',
      details: `Order #${order.id} confirmed — tx: ${tx_signature}`,
    });

    res.json(formatOrder(activatedOrder));
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

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
