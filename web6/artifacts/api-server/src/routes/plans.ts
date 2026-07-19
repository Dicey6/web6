import { Router } from 'express';
import { db } from '@workspace/db';
import { challengePlans } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// GET /v1/challenge-plans — public, list active plans
// ---------------------------------------------------------------------------
router.get('/v1/challenge-plans', async (_req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(challengePlans)
      .where(eq(challengePlans.status, 'active'))
      .orderBy(challengePlans.display_order);

    res.json(plans.map(formatPlan));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch challenge plans' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/challenge-plans/:slug — public, get plan by slug
// ---------------------------------------------------------------------------
router.get('/v1/challenge-plans/:slug', async (req: Request, res: Response) => {
  // Express 5 types params as string | string[] — cast to string
  const slug = String(req.params.slug);

  try {
    const [plan] = await db
      .select()
      .from(challengePlans)
      .where(eq(challengePlans.slug, slug));

    if (!plan) {
      res.status(404).json({ error: 'Challenge plan not found' });
      return;
    }

    res.json(formatPlan(plan));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch challenge plan' });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatPlan(p: typeof challengePlans.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price_usd: Number(p.price_usd),
    funded_sol: Number(p.funded_sol),
    funded_usd_estimate: p.funded_usd_estimate != null ? Number(p.funded_usd_estimate) : null,
    status: p.status,
    display_order: p.display_order,
    description: p.description ?? null,
    profit_target_pct: Number(p.profit_target_pct),
    max_drawdown_pct: Number(p.max_drawdown_pct),
    daily_drawdown_pct: Number(p.daily_drawdown_pct),
    min_trading_days: p.min_trading_days,
    max_position_size_pct: Number(p.max_position_size_pct),
    max_open_positions: p.max_open_positions,
    reactivation_cost_pct: Number(p.reactivation_cost_pct),
    created_at: p.created_at?.toISOString() ?? null,
    updated_at: p.updated_at?.toISOString() ?? null,
  };
}

export default router;
