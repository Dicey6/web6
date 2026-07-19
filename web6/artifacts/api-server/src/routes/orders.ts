import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middlewares/auth.js';
import type { Request, Response } from 'express';
import { getSolPrice } from '../lib/solPrice.js';
import { findPaymentForOrder } from '../lib/helius.js';
import { HARDCODED_PLANS } from './plans.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

const TREASURY_WALLET = process.env.TREASURY_WALLET ?? '';
const REFERRAL_COMMISSION_PCT = 10;

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

    const { data: order, error } = await supabaseAdmin()
      .from('orders')
      .insert({
        user_id: id,
        challenge_plan_id: plan.id,
        status: 'pending',
        amount: plan.price_usd,
        currency: 'USD',
        plan_name: plan.name,
        plan_slug: plan.slug,
        expected_sol: expectedSol,
        sol_price_usd: parseFloat(solPrice.toFixed(2)),
        treasury_wallet: TREASURY_WALLET,
        expiry_time: expiryTime.toISOString(),
        payment_status: 'awaiting_payment',
        referral_code: referral_code ?? null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.json(formatOrder(order));
  } catch (err) {
    console.error('Create order error:', err);
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
    const { data: myOrders, error } = await supabaseAdmin()
      .from('orders')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json((myOrders ?? []).map(formatOrder));
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
    const { data: order, error } = await supabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', id)
      .single();

    if (error || !order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(formatOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:orderId/cancel — cancel pending order
// ---------------------------------------------------------------------------
router.post('/v1/orders/:orderId/cancel', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const orderId = Number(req.params.orderId);

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  try {
    const { data: order } = await supabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', id)
      .single();

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status !== 'pending') {
      res.status(400).json({ error: 'Only pending orders can be cancelled' });
      return;
    }

    const { data: updated, error } = await supabaseAdmin()
      .from('orders')
      .update({ status: 'cancelled', payment_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    res.json(formatOrder(updated));
  } catch {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:orderId/verify — manually trigger on-chain verification
// ---------------------------------------------------------------------------
router.post('/v1/orders/:orderId/verify', requireAuth, async (req: Request, res: Response) => {
  const { id } = (req as AuthenticatedRequest).authUser;
  const orderId = Number(req.params.orderId);

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  try {
    const { data: order } = await supabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', id)
      .single();

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status === 'confirmed') {
      res.json({ status: 'already_confirmed', order: formatOrder(order) });
      return;
    }

    if (order.status === 'cancelled') {
      res.status(400).json({ error: 'Order has been cancelled' });
      return;
    }

    // Check expiry
    if (order.expiry_time && new Date(order.expiry_time) < new Date()) {
      await supabaseAdmin()
        .from('orders')
        .update({ status: 'expired', payment_status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', orderId);
      res.json({ status: 'expired' });
      return;
    }

    // Get all existing confirmed tx signatures to prevent replay attacks
    const { data: confirmedOrders } = await supabaseAdmin()
      .from('orders')
      .select('tx_signature')
      .eq('status', 'confirmed')
      .not('tx_signature', 'is', null);

    const existingTxSignatures = (confirmedOrders ?? [])
      .map((o: Record<string, unknown>) => o.tx_signature as string)
      .filter(Boolean);

    // Check on-chain payment via Helius
    const result = await findPaymentForOrder({
      treasuryWallet: order.treasury_wallet ?? TREASURY_WALLET,
      expectedSol: Number(order.expected_sol),
      orderCreatedAt: new Date(order.created_at),
      expiryTime: new Date(order.expiry_time),
      existingTxSignatures,
    });

    if (!result.found) {
      res.json({ status: 'payment_not_found', order: formatOrder(order) });
      return;
    }

    // Activate the order
    await activateOrder(orderId, id, result.signature!, result.receivedSol!);

    const { data: confirmed } = await supabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    res.json({ status: 'confirmed', order: formatOrder(confirmed) });
  } catch (err) {
    console.error('Verify order error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// ---------------------------------------------------------------------------
// activateOrder — confirm payment, create challenge, process referral
// ---------------------------------------------------------------------------
async function activateOrder(
  orderId: number,
  userId: string,
  txSignature: string,
  receivedSol: number,
): Promise<void> {
  const sb = supabaseAdmin();

  // Prevent double-activation
  const { data: existing } = await sb
    .from('orders')
    .select('id')
    .eq('tx_signature', txSignature)
    .neq('id', orderId)
    .maybeSingle();

  if (existing) throw new Error('Transaction already used for another order');

  const { data: order } = await sb.from('orders').select('*').eq('id', orderId).single();
  if (!order) throw new Error('Order not found');

  // Confirm the order
  await sb
    .from('orders')
    .update({
      status: 'confirmed',
      payment_status: 'confirmed',
      tx_signature: txSignature,
      received_sol: receivedSol,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // Create user challenge
  const plan = HARDCODED_PLANS.find((p) => p.id === order.challenge_plan_id);
  if (plan) {
    await sb.from('user_challenges').insert({
      user_id: userId,
      challenge_plan_id: plan.id,
      order_id: orderId,
      status: 'active',
      started_at: new Date().toISOString(),
      profit_target_pct: plan.profit_target_pct,
      max_drawdown_pct: plan.max_drawdown_pct,
    });
  }

  // Process referral — first purchase only
  if (order.referral_code) {
    const { data: referrer } = await sb
      .from('profiles')
      .select('auth_user_id')
      .eq('referral_code', order.referral_code)
      .maybeSingle();

    if (referrer && referrer.auth_user_id !== userId) {
      const { count: previousOrders } = await sb
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .neq('id', orderId);

      if (!previousOrders || previousOrders === 0) {
        const commission = (Number(order.amount) * REFERRAL_COMMISSION_PCT) / 100;
        await sb.from('referral_earnings').insert({
          referrer_id: referrer.auth_user_id,
          referred_user_id: userId,
          order_id: orderId,
          amount: commission.toFixed(2),
          status: 'pending',
        });
      }
    }
  }

  // Activity log
  await sb.from('activity_logs').insert({
    user_id: userId,
    action: 'challenge_activated',
    details: `Order #${orderId} confirmed on-chain — tx: ${txSignature}`,
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function formatOrder(o: Record<string, unknown>) {
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
    expiry_time: o.expiry_time ?? null,
    payment_status: o.payment_status ?? null,
    tx_signature: o.tx_signature ?? null,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

export default router;
