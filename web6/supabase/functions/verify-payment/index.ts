// =============================================================================
// Supabase Edge Function: verify-payment
// Verifies a Solana on-chain payment using Helius and activates the challenge.
//
// This function is called by a background cron or webhook — NOT directly
// from the frontend. Secrets stay in the Edge Function environment.
//
// Environment variables required (set in Supabase Dashboard → Edge Functions):
//   SUPABASE_URL            — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//   HELIUS_API_KEY          — your Helius API key
//   TREASURY_WALLET         — your SOL treasury wallet address
//   APP_URL                 — https://fundedfrens.com
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYMENT_TOLERANCE = 0.01; // Accept up to 1% less than expected
const REFERRAL_COMMISSION_PCT = 10;

interface Order {
  id: number;
  user_id: string;
  challenge_plan_id: number;
  expected_sol: number;
  treasury_wallet: string;
  created_at: string;
  status: string;
  referral_code: string | null;
  amount: number;
}

const HARDCODED_PLANS = [
  { id: 1, name: 'Starter', slug: 'starter', price_usd: 15, funded_usd: 350, profit_target_pct: 10, max_drawdown_pct: 10 },
  { id: 2, name: 'Standard', slug: 'standard', price_usd: 25, funded_usd: 1100, profit_target_pct: 10, max_drawdown_pct: 10 },
  { id: 3, name: 'Elite', slug: 'elite', price_usd: 50, funded_usd: 3500, profit_target_pct: 10, max_drawdown_pct: 10 },
] as const;

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
  const treasuryWallet = Deno.env.get('TREASURY_WALLET')!;
  const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

  // Parse body — can be called with { order_id } for a specific order or
  // called without a body to sweep all pending orders.
  const body = await req.json().catch(() => ({}));
  const specificOrderId = body?.order_id as number | undefined;

  try {
    // Fetch pending orders
    let ordersQuery = supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .eq('payment_status', 'awaiting_payment')
      .gt('expiry_time', new Date().toISOString());

    if (specificOrderId) {
      ordersQuery = ordersQuery.eq('id', specificOrderId);
    }

    const { data: pendingOrders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    const results = [];

    for (const order of (pendingOrders ?? []) as Order[]) {
      try {
        const txResult = await findPayment(heliusRpcUrl, {
          treasuryWallet: order.treasury_wallet ?? treasuryWallet,
          expectedSol: Number(order.expected_sol),
          afterTime: Math.floor(new Date(order.created_at).getTime() / 1000) - 60,
        });

        if (!txResult.found) {
          results.push({ order_id: order.id, status: 'not_found' });
          continue;
        }

        // Prevent replay attack — check tx_signature uniqueness
        const { data: existingTx } = await supabase
          .from('orders')
          .select('id')
          .eq('tx_signature', txResult.signature)
          .neq('id', order.id)
          .maybeSingle();

        if (existingTx) {
          results.push({ order_id: order.id, status: 'duplicate_tx' });
          continue;
        }

        // Activate the order
        await activateOrder(supabase, order, txResult.signature!, txResult.receivedSol!);
        results.push({ order_id: order.id, status: 'activated', tx: txResult.signature });
      } catch (err) {
        results.push({ order_id: order.id, status: 'error', message: String(err) });
      }
    }

    // Also expire overdue orders
    await supabase
      .from('orders')
      .update({ status: 'expired', payment_status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lt('expiry_time', new Date().toISOString());

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// ---------------------------------------------------------------------------
// activateOrder
// ---------------------------------------------------------------------------
async function activateOrder(
  sb: ReturnType<typeof createClient>,
  order: Order,
  txSignature: string,
  receivedSol: number,
) {
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
    .eq('id', order.id);

  // Create user challenge
  const plan = HARDCODED_PLANS.find((p) => p.id === order.challenge_plan_id);
  if (plan) {
    await sb.from('user_challenges').insert({
      user_id: order.user_id,
      challenge_plan_id: plan.id,
      order_id: order.id,
      status: 'active',
      started_at: new Date().toISOString(),
      profit_target_pct: plan.profit_target_pct,
      max_drawdown_pct: plan.max_drawdown_pct,
    });
  }

  // Referral — first purchase only
  if (order.referral_code) {
    const { data: referrer } = await sb
      .from('profiles')
      .select('auth_user_id')
      .eq('referral_code', order.referral_code)
      .maybeSingle();

    if (referrer && referrer.auth_user_id !== order.user_id) {
      const { count: previousOrders } = await sb
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', order.user_id)
        .eq('status', 'confirmed')
        .neq('id', order.id);

      if (!previousOrders || previousOrders === 0) {
        const commission = (Number(order.amount) * REFERRAL_COMMISSION_PCT) / 100;
        await sb.from('referral_earnings').insert({
          referrer_id: referrer.auth_user_id,
          referred_user_id: order.user_id,
          order_id: order.id,
          amount: commission.toFixed(2),
          status: 'pending',
        });
      }
    }
  }

  // Activity log
  await sb.from('activity_logs').insert({
    user_id: order.user_id,
    action: 'challenge_activated',
    details: `Order #${order.id} verified via Edge Function — tx: ${txSignature}`,
  });
}

// ---------------------------------------------------------------------------
// findPayment — scan Helius for inbound SOL transaction
// ---------------------------------------------------------------------------
interface PaymentResult {
  found: boolean;
  signature?: string;
  receivedSol?: number;
}

async function findPayment(
  rpcUrl: string,
  opts: { treasuryWallet: string; expectedSol: number; afterTime: number },
): Promise<PaymentResult> {
  // Get recent signatures for the treasury wallet
  const sigsResp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [opts.treasuryWallet, { limit: 20 }],
    }),
  });

  if (!sigsResp.ok) return { found: false };
  const sigsData = await sigsResp.json();
  const signatures: Array<{ signature: string; blockTime: number }> = sigsData?.result ?? [];

  const recentSigs = signatures.filter((s) => (s.blockTime ?? 0) >= opts.afterTime);

  for (const sig of recentSigs) {
    const txResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [sig.signature, { encoding: 'json', commitment: 'confirmed' }],
      }),
    });

    if (!txResp.ok) continue;
    const txData = await txResp.json();
    const tx = txData?.result;

    if (!tx?.meta || tx.meta.err) continue;

    const accounts: string[] = tx.transaction?.message?.accountKeys ?? [];
    const walletIdx = accounts.indexOf(opts.treasuryWallet);
    if (walletIdx === -1) continue;

    const preBalance = tx.meta.preBalances[walletIdx] ?? 0;
    const postBalance = tx.meta.postBalances[walletIdx] ?? 0;
    const receivedSol = (postBalance - preBalance) / 1e9;

    if (receivedSol >= opts.expectedSol * (1 - 0.01)) {
      return { found: true, signature: sig.signature, receivedSol };
    }
  }

  return { found: false };
}
