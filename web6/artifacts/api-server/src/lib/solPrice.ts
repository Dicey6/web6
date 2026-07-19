// ---------------------------------------------------------------------------
// Live SOL/USD price with a 60-second in-memory cache.
// Falls back to the last known price, or 150 if no price has ever been fetched.
// ---------------------------------------------------------------------------

let cachedPrice: number | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;
const FALLBACK_PRICE = 150;

export async function getSolPrice(): Promise<number> {
  if (cachedPrice !== null && Date.now() < cacheExpiry) return cachedPrice;

  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!resp.ok) throw new Error(`CoinGecko HTTP ${resp.status}`);
    const data = (await resp.json()) as { solana?: { usd?: number } };
    const price = data?.solana?.usd;
    if (price && price > 0) {
      cachedPrice = price;
      cacheExpiry = Date.now() + CACHE_TTL_MS;
      return price;
    }
  } catch {
    // fall through to fallback
  }

  return cachedPrice ?? FALLBACK_PRICE;
}
