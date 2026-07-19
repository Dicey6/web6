// ---------------------------------------------------------------------------
// Helius RPC helpers for on-chain payment verification.
// All blockchain communication happens here — never in the frontend.
//
// Required env var: HELIUS_RPC_URL
//   e.g. https://mainnet.helius-rpc.com/?api-key=<YOUR_KEY>
// ---------------------------------------------------------------------------

const PAYMENT_TOLERANCE = 0.01; // accept up to 1% less than expected (rounding)

function getRpcUrl(): string {
  const url = process.env.HELIUS_RPC_URL ?? '';
  return url;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const url = getRpcUrl();
  if (!url) throw new Error('HELIUS_RPC_URL is not configured');

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`Helius HTTP ${resp.status}`);

  const json = (await resp.json()) as {
    result?: unknown;
    error?: { message: string };
  };
  if (json.error) throw new Error(`Helius RPC: ${json.error.message}`);
  return json.result;
}

export interface PaymentResult {
  found: boolean;
  signature?: string;
  receivedSol?: number;
  blockTime?: number;
}

/**
 * Scan the most recent transactions to the treasury wallet and look for one
 * that matches this order's expected SOL amount within the configured tolerance.
 *
 * Security guarantees:
 * - Only transactions whose blockTime falls within [orderCreatedAt, expiryTime] are accepted.
 * - Transactions already claimed by any other order (existingTxSignatures) are rejected.
 * - Failed transactions (err != null) are ignored.
 */
export async function findPaymentForOrder(opts: {
  treasuryWallet: string;
  expectedSol: number;
  orderCreatedAt: Date;
  expiryTime: Date;
  existingTxSignatures: string[];
}): Promise<PaymentResult> {
  if (!getRpcUrl()) return { found: false };

  let sigs: Array<{ signature: string; blockTime: number | null; err: unknown }>;

  try {
    sigs = (await rpcCall('getSignaturesForAddress', [
      opts.treasuryWallet,
      { limit: 25 },
    ])) as typeof sigs;
  } catch {
    return { found: false };
  }

  if (!Array.isArray(sigs)) return { found: false };

  const minTime = Math.floor(opts.orderCreatedAt.getTime() / 1000) - 30; // 30s grace
  const maxTime = Math.floor(opts.expiryTime.getTime() / 1000);

  for (const sig of sigs) {
    if (sig.err) continue;
    if (!sig.blockTime) continue;
    if (sig.blockTime < minTime || sig.blockTime > maxTime) continue;
    if (opts.existingTxSignatures.includes(sig.signature)) continue;

    let tx: {
      meta: { preBalances: number[]; postBalances: number[]; err: unknown };
      transaction: {
        message: { accountKeys: Array<string | { pubkey: string }> };
      };
    } | null;

    try {
      tx = (await rpcCall('getTransaction', [
        sig.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ])) as typeof tx;
    } catch {
      continue;
    }

    if (!tx?.meta || tx.meta.err) continue;

    const accountKeys: string[] = tx.transaction.message.accountKeys.map(
      (k) => (typeof k === 'string' ? k : k.pubkey),
    );
    const walletIdx = accountKeys.indexOf(opts.treasuryWallet);
    if (walletIdx === -1) continue;

    const preBalance = tx.meta.preBalances[walletIdx] ?? 0;
    const postBalance = tx.meta.postBalances[walletIdx] ?? 0;
    const receivedSol = (postBalance - preBalance) / 1e9;

    if (receivedSol >= opts.expectedSol * (1 - PAYMENT_TOLERANCE)) {
      return {
        found: true,
        signature: sig.signature,
        receivedSol,
        blockTime: sig.blockTime,
      };
    }
  }

  return { found: false };
}
