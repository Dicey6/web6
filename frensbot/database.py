"""
database.py — All Supabase interactions for the FundedFrens Telegram bot.

This module owns every database read and write. No business logic lives here;
it is purely a data-access layer. All methods are async.

The bot authenticates to Supabase with the service-role key, which bypasses
Row Level Security. Every query is explicitly scoped by user_id.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import acreate_client, AsyncClient

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singleton client
# ---------------------------------------------------------------------------

_client: AsyncClient | None = None


async def get_client() -> AsyncClient:
    """Return the shared Supabase async client, creating it once."""
    global _client
    if _client is None:
        _client = await acreate_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------
Row = dict[str, Any]


# ---------------------------------------------------------------------------
# Profile operations
# ---------------------------------------------------------------------------

async def get_profile_by_telegram_id(telegram_id: int) -> Row | None:
    """Fetch a profile row by Telegram user ID."""
    db = await get_client()
    res = await (
        db.table("profiles")
        .select("*")
        .eq("telegram_id", telegram_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def get_profile_by_link_token(token: str) -> Row | None:
    """
    Fetch a profile by its pending link token.
    The token is valid for 10 minutes; caller must verify updated_at.
    """
    db = await get_client()
    res = await (
        db.table("profiles")
        .select("*")
        .eq("telegram_link_token", token)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def link_telegram(
    profile_id: int,
    telegram_id: int,
    telegram_username: str | None,
) -> Row:
    """Write telegram_id to profile and mark status as linked."""
    db = await get_client()
    updates: dict = {
        "telegram_id": telegram_id,
        "telegram_link_token": None,        # consume the one-time token
        "telegram_status": "linked",
        "updated_at": _now(),
    }
    if telegram_username:
        updates["telegram_username"] = telegram_username
    res = await (
        db.table("profiles")
        .update(updates)
        .eq("id", profile_id)
        .execute()
    )
    return res.data[0]


async def unlink_telegram(auth_user_id: str) -> None:
    """Remove the Telegram link from a profile."""
    db = await get_client()
    await (
        db.table("profiles")
        .update({
            "telegram_id": None,
            "telegram_link_token": None,
            "telegram_status": "not_linked",
            "updated_at": _now(),
        })
        .eq("auth_user_id", auth_user_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Challenge / account operations
# ---------------------------------------------------------------------------

async def get_active_challenge(user_id: str) -> Row | None:
    """
    Return the user's active challenge joined with its plan details.
    Returns None if the user has no active challenge.
    """
    db = await get_client()
    res = await (
        db.table("user_challenges")
        .select("*, challenge_plans(*)")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data
    if not rows:
        return None
    return rows[0]


# ---------------------------------------------------------------------------
# Bot settings
# ---------------------------------------------------------------------------

async def get_bot_settings(user_id: str) -> Row:
    """
    Return bot_settings for the user.
    Creates a default row if one doesn't exist yet (upsert pattern).
    """
    db = await get_client()
    res = await (
        db.table("bot_settings")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if rows:
        return rows[0]

    # Auto-create defaults
    defaults = {
        "user_id": user_id,
        "default_buy_sol": 0.1,
        "default_sl_pct": 20.0,
        "default_tp_pct": 50.0,
        "default_auto_sell_pct": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    insert_res = await db.table("bot_settings").insert(defaults).execute()
    return insert_res.data[0]


async def update_bot_settings(user_id: str, updates: dict) -> Row:
    """Partial update of bot_settings."""
    db = await get_client()
    updates["updated_at"] = _now()
    res = await (
        db.table("bot_settings")
        .update(updates)
        .eq("user_id", user_id)
        .execute()
    )
    return res.data[0]


# ---------------------------------------------------------------------------
# Position operations
# ---------------------------------------------------------------------------

async def get_open_positions(user_id: str) -> list[Row]:
    """Return all open positions for the user, newest first."""
    db = await get_client()
    res = await (
        db.table("positions")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "open")
        .order("opened_at", desc=True)
        .execute()
    )
    return res.data or []


async def count_open_positions(user_id: str) -> int:
    """Count open positions (used for the 3-position limit check)."""
    db = await get_client()
    res = await (
        db.table("positions")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "open")
        .execute()
    )
    return res.count or 0


async def get_position_by_id(position_id: int, user_id: str) -> Row | None:
    """Fetch a single position, scoped to user_id for safety."""
    db = await get_client()
    res = await (
        db.table("positions")
        .select("*")
        .eq("id", position_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def get_position_by_token(user_id: str, token_address: str) -> Row | None:
    """Return any existing open position for this token."""
    db = await get_client()
    res = await (
        db.table("positions")
        .select("*")
        .eq("user_id", user_id)
        .eq("token_address", token_address)
        .eq("status", "open")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def open_position(data: dict) -> Row:
    """Insert a new open position row."""
    db = await get_client()
    data.setdefault("status", "open")
    data.setdefault("opened_at", _now())
    res = await db.table("positions").insert(data).execute()
    return res.data[0]


async def update_position(position_id: int, updates: dict) -> Row:
    """Apply partial updates to a position."""
    db = await get_client()
    updates["updated_at"] = _now()
    res = await (
        db.table("positions")
        .update(updates)
        .eq("id", position_id)
        .execute()
    )
    return res.data[0]


async def close_position(position_id: int) -> Row:
    """Mark a position as closed."""
    db = await get_client()
    res = await (
        db.table("positions")
        .update({"status": "closed", "closed_at": _now(), "updated_at": _now()})
        .eq("id", position_id)
        .execute()
    )
    return res.data[0]


# ---------------------------------------------------------------------------
# Trade operations
# ---------------------------------------------------------------------------

async def record_trade(data: dict) -> Row:
    """Insert a trade record and return it."""
    db = await get_client()
    data.setdefault("created_at", _now())
    res = await db.table("trades").insert(data).execute()
    return res.data[0]


async def get_trade(trade_id: int, user_id: str) -> Row | None:
    """Fetch a single trade, scoped to user_id."""
    db = await get_client()
    res = await (
        db.table("trades")
        .select("*")
        .eq("id", trade_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def get_recent_closed_trades(user_id: str, limit: int = 10) -> list[Row]:
    """Return the most recent closed trades for the user."""
    db = await get_client()
    res = await (
        db.table("trades")
        .select("*")
        .eq("user_id", user_id)
        .eq("side", "sell")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


async def get_realized_pnl(user_id: str, challenge_id: int) -> float:
    """Sum of pnl_sol on all sell trades for this challenge."""
    db = await get_client()
    res = await (
        db.table("trades")
        .select("pnl_sol")
        .eq("user_id", user_id)
        .eq("challenge_id", challenge_id)
        .eq("side", "sell")
        .execute()
    )
    rows = res.data or []
    return sum(float(r["pnl_sol"] or 0) for r in rows)


# ---------------------------------------------------------------------------
# Account summary (aggregated)
# ---------------------------------------------------------------------------

async def get_account_summary(user_id: str, challenge: dict) -> dict:
    """
    Compute the account's current financial state.

    Returns:
        start_balance   — funded_sol from challenge plan
        invested_sol    — SOL currently locked in open positions
        realized_pnl    — SOL profit/loss from closed trades
        available_sol   — balance free to trade
        challenge_id    — user_challenges.id
    """
    challenge_id = challenge["id"]
    plan = challenge.get("challenge_plans") or {}
    start_balance = float(plan.get("funded_sol", 0))

    # Open positions total
    positions = await get_open_positions(user_id)
    invested_sol = sum(float(p["amount_sol_invested"]) for p in positions)

    # Realized PnL
    realized_pnl = await get_realized_pnl(user_id, challenge_id)

    available_sol = start_balance - invested_sol + realized_pnl

    return {
        "challenge_id": challenge_id,
        "start_balance": start_balance,
        "invested_sol": invested_sol,
        "realized_pnl": realized_pnl,
        "available_sol": max(0.0, available_sol),
        "open_positions": positions,
        "plan": plan,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
