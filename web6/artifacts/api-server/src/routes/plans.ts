import { Router } from 'express';
import { getSolPrice } from '../lib/solPrice.js';
import type { Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Canonical plan definitions — USD values are the permanent source of truth.
// funded_sol is computed dynamically from the live SOL/USD price on every request.
// ---------------------------------------------------------------------------
export const HARDCODED_PLANS = [
  {
    id: 1,
    name: 'Starter',
    slug: 'starter',
    price_usd: 15,
    funded_usd: 350,
    status: 'active',
    display_order: 1,
    description: 'Entry-level funded account. Ideal for emerging traders.',
    profit_target_pct: 10,
    max_drawdown_pct: 10,
    daily_drawdown_pct: 5,
    min_trading_days: 3,
    max_position_size_pct: 25,
    max_open_positions: 3,
    reactivation_cost_pct: 50,
  },
  {
    id: 2,
    name: 'Standard',
    slug: 'standard',
    price_usd: 25,
    funded_usd: 1100,
    status: 'active',
    display_order: 2,
    description: 'Mid-size funded account for confident traders.',
    profit_target_pct: 10,
    max_drawdown_pct: 10,
    daily_drawdown_pct: 5,
    min_trading_days: 3,
    max_position_size_pct: 25,
    max_open_positions: 5,
    reactivation_cost_pct: 50,
  },
  {
    id: 3,
    name: 'Elite',
    slug: 'elite',
    price_usd: 50,
    funded_usd: 3500,
    status: 'active',
    display_order: 3,
    description: 'Large funded account for experienced traders.',
    profit_target_pct: 10,
    max_drawdown_pct: 10,
    daily_drawdown_pct: 5,
    min_trading_days: 3,
    max_position_size_pct: 25,
    max_open_positions: 10,
    reactivation_cost_pct: 50,
  },
] as const;

export type HardcodedPlan = (typeof HARDCODED_PLANS)[number];

async function formatPlan(p: HardcodedPlan) {
  const solPrice = await getSolPrice();
  const fundedSol = parseFloat((p.funded_usd / solPrice).toFixed(2));
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price_usd: p.price_usd,
    funded_sol: fundedSol,
    funded_usd_estimate: p.funded_usd,
    status: p.status,
    display_order: p.display_order,
    description: p.description,
    profit_target_pct: p.profit_target_pct,
    max_drawdown_pct: p.max_drawdown_pct,
    daily_drawdown_pct: p.daily_drawdown_pct,
    min_trading_days: p.min_trading_days,
    max_position_size_pct: p.max_position_size_pct,
    max_open_positions: p.max_open_positions,
    reactivation_cost_pct: p.reactivation_cost_pct,
    created_at: null,
    updated_at: null,
  };
}

// ---------------------------------------------------------------------------
// GET /v1/challenge-plans — public, list all active plans with live SOL price
// ---------------------------------------------------------------------------
router.get('/v1/challenge-plans', async (_req: Request, res: Response) => {
  try {
    const plans = await Promise.all(HARDCODED_PLANS.map(formatPlan));
    res.json(plans);
  } catch {
    res.status(500).json({ error: 'Failed to fetch challenge plans' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/challenge-plans/:slug — public, single plan by slug
// ---------------------------------------------------------------------------
router.get('/v1/challenge-plans/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const plan = HARDCODED_PLANS.find((p) => p.slug === slug);
  if (!plan) {
    res.status(404).json({ error: 'Challenge plan not found' });
    return;
  }
  try {
    res.json(await formatPlan(plan));
  } catch {
    res.status(500).json({ error: 'Failed to fetch challenge plan' });
  }
});

export default router;
