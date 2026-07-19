// Supabase Edge Function: verify-payment
//
// Automatically sweeps pending orders and verifies on-chain SOL payments via
// the Helius RPC API. Called by an external cron (every ~2 min) or directly
// via the Supabase Dashboard Invoke button for testing.
//
// Request format (POST):
//   {}                   — sweep all pending orders
//   { "order_id": 42 }  — check one specific order
//
// Response:
//   { "processed": N, "results": [...] }
//
// No user authentication required — this function is internal infrastructure,
// not a public endpoint. Secrets never leave the Edge Function environment.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   HELIUS_API_KEY    — Helius API key (without the URL wrapper)
//   TREASURY_WALLET   — SOL wallet address that receives payments
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAYMENT_TOLERANCE_PCT = 0.01; // accept up to 1% under expected amount
const REFERRAL_COMMISSION_PCT = 10;
const TX_SCAN_LIMIT = 50; // recent transactions to scan per sweep

const HARDCODED_PLANS = [
  { id: 1, name: 'Starter',  slug: 'starter',  price_usd: 15, funded_usd: 350,  profit_target_pct: 10, max_drawdown_pct: 10 },
  { id: 2, name: 'Standard', slug: 'standard', price_usd: 25, funded_usd: 1100, profit_target_pct: 10, max_drawdown_pct: 10 },
  { id: 3, name: 'Elite',    slug: 'elite',    price_usd: 50, funded_usd: 3500, profit_target_pct: 10, max_drawdown_pct: 10 },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Order {
  id: number;
  user_id: string;
  challenge_plan_id: number;
  expected_sol: number;
  treasury_wallet: string | null;
  created_at: string;
  expiry_time: string;
  status: string;
  referral_code: string | null;
  amount: number;
}

interface PaymentResult {
  found: boolean;
  signature?: string;
  receivedSol?: number;
  failReason?: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
  const treasuryWallet = Deno.env.get('TREASURY_WALLET');

  if (!supabaseUrl || !serviceRoleKey || !heliusApiKey || !treasuryWallet) {
    return json({ error: 'Missing required environment variables' }, 500);
  }

  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Parse request body
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const specificOrderId = typeof body?.order_id === 'number' ? body.order_id : undefined;

  try {
    // ------------------------------------------------------------------
    // 1. Expire overdue orders (runs every invocation as a free cleanup)
    // ------------------------------------------------------------------
    await sb
      .from('orders')
      .update({ status: 'expired', payment_status: 'expired', updated_at: now() })
      .eq('status', 'pending')
      .lt('expiry_time', now());

    // ------------------------------------------------------------------
    // 2. Fetch pending orders to process
    // ------------------------------------------------------------------
    let query = sb
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .eq('payment_status', 'awaiting_payment')
      .gt('expiry_time', now());

    if (specificOrderId !== undefined) {
      query = query.eq('id', specificOrderId);
    }

    const { data: pendingOrders, error: ordersError } = await query;
    if (ordersError) throw ordersError;

    if (!pendingOrders || pendingOrders.length === 0) {
      return json({ processed: 0, results: [] });
    }

    // ------------------------------------------------------------------
    // 3. Pre-fetch all already-used tx signatures (prevents replay attacks
    //    across all orders without a per-order round-trip)
    // ------------------------------------------------------------------
    const { data: usedTxRows } = await sb
      .from('orders')
      .select('tx_signature')
      .eq('status', 'confirmed')
      .not('tx_signature', 'is', null);

    const usedSignatures = new Set(
      (usedTxRows ?? []).map((r: { tx_signature: string }) => r.tx_signature).filter(Boolean)
    );

    // ------------------------------------------------------------------
    // 4. Fetch recent transactions for the treasury wallet once.
    //    We do this once and reuse across all pending orders — much faster
    //    than one Helius call per order.
    // ------------------------------------------------------------------
    const recentTxs = await fetchRecentTransactions(rpcUrl, treasuryWallet, TX_SCAN_LIMIT);

    // ------------------------------------------------------------------
    // 5. Process each pending order
    // ------------------------------------------------------------------
    const results: Record<string, unknown>[] = [];

    for (const order of pendingOrders as Order[]) {
      try {
        const effectiveWallet = order.treasury_wallet ?? treasuryWallet;
        const orderCreatedAt = Math.floor(new Date(order.created_at).getTime() / 1000);
        // Look 60 seconds before order creation to account for clock skew
        const afterTime = orderCreatedAt - 60;

        // Find a matching on-chain payment
        const payment = findMatchingPayment(recentTxs, {
          treasuryWallet: effectiveWallet,
          expectedSol: Number(order.expected_sol),
          afterTime,
          usedSignatures,
        });

        if (!payment.found) {
          results.push({ order_id: order.id, status: 'not_found', reason: payment.failReason });
          continue;
        }

        // ------------------------------------------------------------------
        // Atomic claim — prevent race conditions between concurrent invocations.
        // Only the invocation that successfully flips status → processing owns it.
        // ------------------------------------------------------------------
        const { data: claimed, error: claimError } = await sb
          .from('orders')
          .update({ status: 'processing', updated_at: now() })
          .eq('id', order.id)
          .eq('status', 'pending') // atomic guard
          .select('id')
          .maybeSingle();

        if (claimError || !claimed) {
          // Another invocation already claimed this order
          results.push({ order_id: order.id, status: 'skipped_concurrent' });
          continue;
        }

        // Mark this signature as used immediately (in-memory) so subsequent
        // orders in this same sweep don't accidentally claim the same tx
        usedSignatures.add(payment.signature!);

        // Activate the order
        await activateOrder(sb, order, payment.signature!, payment.receivedSol!);
        results.push({ order_id: order.id, status: 'activated', tx: payment.signature });

      } catch (err) {
        console.error(`Error processing order ${order.id}:`, err);
        // Roll back the processing claim so the next sweep can retry
        await sb
          .from('orders')
          .update({ status: 'pending', updated_at: now() })
          .eq('id', order.id)
          .eq('status', 'processing');

        results.push({ order_id: order.id, status: 'error', message: String(err) });
      }
    }

    return json({ processed: results.length, results });

  } catch (err) {
    console.error('verify-payment fatal error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// activateOrder — confirm order, create challenge, process referral
// ---------------------------------------------------------------------------

async function activateOrder(
  sb: ReturnType<typeof createClient>,
  order: Order,
  txSignature: string,
  receivedSol: number,
): Promise<void> {
  // Confirm the order
  const { error: confirmError } = await sb
    .from('orders')
    .update({
      status: 'confirmed',
      payment_status: 'confirmed',
      tx_signature: txSignature,
      received_sol: receivedSol,
      updated_at: now(),
    })
    .eq('id', order.id);

  if (confirmError) throw new Error(`Failed to confirm order: ${confirmError.message}`);

  // Create the user challenge
  const plan = HARDCODED_PLANS.find((p) => p.id === order.challenge_plan_id);
  if (plan) {
    const { error: challengeError } = await sb.from('user_challenges').insert({
      user_id: order.user_id,
      challenge_plan_id: plan.id,
      order_id: order.id,
      status: 'active',
      started_at: now(),
      profit_target_pct: plan.profit_target_pct,
      max_drawdown_pct: plan.max_drawdown_pct,
    });

    if (challengeError) {
      console.error(`Failed to create challenge for order ${order.id}:`, challengeError.message);
    }
  } else {
    console.warn(`No plan found for challenge_plan_id=${order.challenge_plan_id}`);
  }

  // Process referral — first purchase only
  if (order.referral_code) {
    try {
      await processReferral(sb, order);
    } catch (err) {
      // Referral failure must not roll back the order confirmation
      console.error(`Referral processing failed for order ${order.id}:`, err);
    }
  }

  // Activity log
  await sb.from('activity_logs').insert({
    user_id: order.user_id,
    action: 'challenge_activated',
    details: `Order #${order.id} confirmed on-chain. tx: ${txSignature}, received: ${receivedSol} SOL`,
  }).then(({ error }) => {
    if (error) console.warn('Failed to write activity log:', error.message);
  });
}

// ---------------------------------------------------------------------------
// processReferral — 10% commission on first purchase only
// ---------------------------------------------------------------------------

async function processReferral(
  sb: ReturnType<typeof createClient>,
  order: Order,
): Promise<void> {
  const { data: referrer } = await sb
    .from('profiles')
    .select('auth_user_id')
    .eq('referral_code', order.referral_code!)
    .maybeSingle();

  if (!referrer) return;
  // Referrer cannot earn commission from their own purchase
  if (referrer.auth_user_id === order.user_id) return;

  // Only credit on the referred user's first confirmed purchase
  const { count: previousPurchases } = await sb
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', order.user_id)
    .eq('status', 'confirmed')
    .neq('id', order.id);

  if (previousPurchases && previousPurchases > 0) return;

  const commission = (Number(order.amount) * REFERRAL_COMMISSION_PCT) / 100;

  await sb.from('referral_earnings').insert({
    referrer_id: referrer.auth_user_id,
    referred_user_id: order.user_id,
    order_id: order.id,
    amount: commission.toFixed(2),
    status: 'pending',
  });
}

// ---------------------------------------------------------------------------
// fetchRecentTransactions — get raw confirmed transactions from Helius RPC
// ---------------------------------------------------------------------------

interface RawTx {
  signature: string;
  blockTime: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any;
}

async function fetchRecentTransactions(
  rpcUrl: string,
  wallet: string,
  limit: number,
): Promise<RawTx[]> {
  // Step 1: get recent signatures
  const sigsResp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [wallet, { limit, commitment: 'confirmed' }],
    }),
  });

  if (!sigsResp.ok) {
    console.error('getSignaturesForAddress HTTP error:', sigsResp.status);
    return [];
  }

  const sigsData = await sigsResp.json();
  const sigEntries: Array<{ signature: string; blockTime: number; err: unknown }> =
    sigsData?.result ?? [];

  // Filter out failed transactions early
  const validSigs = sigEntries.filter((s) => s.err === null);

  // Step 2: fetch full transaction details in parallel (batched)
  const txResults = await Promise.allSettled(
    validSigs.map(async (sig) => {
      const txResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            sig.signature,
            {
              encoding: 'json',
              commitment: 'confirmed',
              // Support both legacy and versioned (v0) transactions
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      });

      if (!txResp.ok) return null;
      const txData = await txResp.json();
      const detail = txData?.result;
      if (!detail) return null;

      return { signature: sig.signature, blockTime: sig.blockTime ?? 0, detail } as RawTx;
    })
  );

  return txResults
    .filter((r): r is PromiseFulfilledResult<RawTx> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

// ---------------------------------------------------------------------------
// findMatchingPayment — match a transaction to a pending order by amount
// ---------------------------------------------------------------------------

function findMatchingPayment(
  txs: RawTx[],
  opts: {
    treasuryWallet: string;
    expectedSol: number;
    afterTime: number;
    usedSignatures: Set<string>;
  },
): PaymentResult {
  const minSol = opts.expectedSol * (1 - PAYMENT_TOLERANCE_PCT);

  for (const tx of txs) {
    // Skip transactions before the order was created
    if ((tx.blockTime ?? 0) < opts.afterTime) continue;

    // Skip already-used signatures
    if (opts.usedSignatures.has(tx.signature)) continue;

    const meta = tx.detail?.meta;
    if (!meta || meta.err !== null) continue;

    // -----------------------------------------------------------------------
    // Parse account keys — handles both legacy (string[]) and versioned
    // (object[]) transaction formats returned by Helius.
    //
    // Legacy:   accountKeys = ["pubkey1", "pubkey2", ...]
    // Versioned: accountKeys = [{ pubkey: "...", signer: bool, writable: bool }, ...]
    // -----------------------------------------------------------------------
    const rawKeys: unknown[] =
      tx.detail?.transaction?.message?.accountKeys ??
      tx.detail?.transaction?.message?.staticAccountKeys ?? // some v0 responses
      [];

    const accountKeys: string[] = rawKeys.map((k) =>
      typeof k === 'string' ? k : (k as { pubkey: string }).pubkey
    );

    const walletIdx = accountKeys.indexOf(opts.treasuryWallet);
    if (walletIdx === -1) continue;

    const preBalance: number = meta.preBalances?.[walletIdx] ?? 0;
    const postBalance: number = meta.postBalances?.[walletIdx] ?? 0;
    const receivedSol = (postBalance - preBalance) / 1e9;

    if (receivedSol >= minSol) {
      return { found: true, signature: tx.signature, receivedSol };
    }
  }

  return { found: false, failReason: 'no_matching_transaction' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

// deno-lint-ignore no-explicit-any
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
