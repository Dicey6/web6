"""
trading.py — Market data fetching and trade simulation engine.

All trading in V1 is simulated. No wallets, no blockchain transactions,
no private keys. Trades are recorded in Supabase using live price data
fetched from DexScreener.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

import database as db
from config import TRADING

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TokenData:
    address: str
    symbol: str
    name: str
    price_sol: float            # price per token in SOL (native)
    price_usd: float
    market_cap_usd: float
    liquidity_usd: float
    volume_24h_usd: float
    price_change_24h: float     # %
    dex_id: str
    pair_address: str
    logo_url: str | None = None


@dataclass
class TriggerResult:
    """Describes an automatic position closure event."""
    trigger: str                # 'stop_loss' | 'take_profit' | 'trailing_stop' | 'auto_sell'
    position_id: int
    user_id: str
    telegram_id: int | None
    token_symbol: str
    pnl_sol: float
    pnl_pct: float
    exit_price_sol: float
    invested_sol: float


# ---------------------------------------------------------------------------
# DexScreener API
# ---------------------------------------------------------------------------

_HTTP_TIMEOUT = 10.0


async def get_token_data(token_address: str) -> TokenData | None:
    """
    Fetch live token data from DexScreener.
    Returns the most liquid Solana pair for the given mint address.
    Returns None if the token is not found or unsupported.
    """
    url = f"{TRADING.dexscreener_base}/tokens/{token_address}"
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, Exception) as exc:
        log.warning("DexScreener token fetch failed for %s: %s", token_address, exc)
        return None

    pairs = data.get("pairs") or []
    # Filter to Solana pairs only
    sol_pairs = [p for p in pairs if p.get("chainId") == "solana"]
    if not sol_pairs:
        return None

    # Pick the pair with the highest liquidity
    best = max(sol_pairs, key=lambda p: float(p.get("liquidity", {}).get("usd", 0) or 0))
    return _parse_pair(best)


async def search_tokens(query: str) -> list[TokenData]:
    """
    Search DexScreener for tokens matching a symbol or name.
    Returns up to 5 results, Solana only.
    """
    url = f"{TRADING.dexscreener_base}/search"
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(url, params={"q": query}, headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, Exception) as exc:
        log.warning("DexScreener search failed for '%s': %s", query, exc)
        return []

    pairs = data.get("pairs") or []
    sol_pairs = [p for p in pairs if p.get("chainId") == "solana"]

    # Deduplicate by base token address, pick highest liquidity per token
    seen: dict[str, TokenData] = {}
    for pair in sol_pairs:
        base_addr = (pair.get("baseToken") or {}).get("address", "")
        if not base_addr or base_addr in seen:
            continue
        td = _parse_pair(pair)
        if td:
            seen[base_addr] = td

    return list(seen.values())[:5]


def _parse_pair(pair: dict) -> TokenData | None:
    """Convert a DexScreener pair object into a TokenData."""
    try:
        base = pair.get("baseToken") or {}
        price_native = float(pair.get("priceNative") or 0)
        price_usd = float(pair.get("priceUsd") or 0)
        mc = float((pair.get("marketCap") or pair.get("fdv") or 0))
        liquidity = float((pair.get("liquidity") or {}).get("usd", 0) or 0)
        volume = float((pair.get("volume") or {}).get("h24", 0) or 0)
        change_24h = float((pair.get("priceChange") or {}).get("h24", 0) or 0)
        logo = (pair.get("info") or {}).get("imageUrl")

        if not base.get("address") or price_native == 0:
            return None

        return TokenData(
            address=base["address"],
            symbol=base.get("symbol", "UNKNOWN"),
            name=base.get("name", base.get("symbol", "Unknown")),
            price_sol=price_native,
            price_usd=price_usd,
            market_cap_usd=mc,
            liquidity_usd=liquidity,
            volume_24h_usd=volume,
            price_change_24h=change_24h,
            dex_id=pair.get("dexId", ""),
            pair_address=pair.get("pairAddress", ""),
            logo_url=logo,
        )
    except (ValueError, TypeError) as exc:
        log.debug("Failed to parse pair: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

async def validate_token(token_address: str) -> tuple[bool, str, TokenData | None]:
    """
    Validate that a token can be traded.

    Returns:
        (ok, error_message, token_data)
    """
    if len(token_address) < 32 or len(token_address) > 44:
        return False, "❌ That doesn't look like a valid Solana token address.", None

    token = await get_token_data(token_address)
    if token is None:
        return False, "❌ Token not found on DexScreener. Please check the contract address.", None

    if not is_supported_launchpad(token):
        return (
            False,
            f"❌ *{token.symbol}* is not available on a supported platform.\n"
            f"Supported: Raydium, Pump.fun, Moonshot, Meteora, Orca.",
            None,
        )

    if token.liquidity_usd < 1000:
        return (
            False,
            f"❌ *{token.symbol}* has insufficient liquidity (${token.liquidity_usd:,.0f}).\n"
            "Minimum required: $1,000",
            None,
        )

    return True, "", token


def is_supported_launchpad(token: TokenData) -> bool:
    """Check whether the token trades on a supported Solana DEX."""
    return token.dex_id.lower() in TRADING.supported_dex_ids


# ---------------------------------------------------------------------------
# Trade simulation
# ---------------------------------------------------------------------------

async def simulate_buy(
    user_id: str,
    challenge_id: int,
    token: TokenData,
    amount_sol: float,
    sl_pct: float | None,
    tp_pct: float | None,
    trailing_stop_pct: float | None = None,
    auto_sell_pct: float | None = None,
) -> dict:
    """
    Simulate a buy. Records a position and a trade in Supabase.
    Returns the newly created position row.
    """
    # Open position
    position = await db.open_position({
        "user_id": user_id,
        "challenge_id": challenge_id,
        "token_address": token.address,
        "token_symbol": token.symbol,
        "token_name": token.name,
        "token_logo_url": token.logo_url,
        "amount_sol_invested": amount_sol,
        "entry_price_sol": token.price_sol,
        "entry_market_cap_usd": token.market_cap_usd,
        "highest_price_sol": token.price_sol,   # track high-water mark for TSL
        "stop_loss_pct": sl_pct,
        "take_profit_pct": tp_pct,
        "trailing_stop_pct": trailing_stop_pct,
        "auto_sell_pct": auto_sell_pct,
        "status": "open",
    })

    # Record buy trade
    await db.record_trade({
        "user_id": user_id,
        "challenge_id": challenge_id,
        "position_id": position["id"],
        "token_address": token.address,
        "token_symbol": token.symbol,
        "token_name": token.name,
        "side": "buy",
        "amount_sol": amount_sol,
        "entry_price_sol": token.price_sol,
        "market_cap_usd": token.market_cap_usd,
        "trigger": "manual",
    })

    return position


async def simulate_sell(
    user_id: str,
    challenge_id: int,
    position: dict,
    sell_pct: float,
    current_price_sol: float,
    current_market_cap_usd: float,
    trigger: str = "manual",
) -> tuple[dict, dict]:
    """
    Simulate a partial or full sell.

    Returns (updated_position, trade_record).
    sell_pct: 0 < sell_pct <= 100
    """
    sell_pct = max(0.0, min(100.0, sell_pct))
    invested = float(position["amount_sol_invested"])
    entry_price = float(position["entry_price_sol"])

    # SOL portion being closed
    sol_portion = invested * (sell_pct / 100.0)

    # Exit value (what the sold portion is worth now)
    price_ratio = current_price_sol / entry_price if entry_price > 0 else 1.0
    exit_value_sol = sol_portion * price_ratio

    pnl_sol = exit_value_sol - sol_portion
    pnl_pct = (price_ratio - 1.0) * 100.0

    # Record sell trade
    trade = await db.record_trade({
        "user_id": user_id,
        "challenge_id": challenge_id,
        "position_id": position["id"],
        "token_address": position["token_address"],
        "token_symbol": position["token_symbol"],
        "token_name": position.get("token_name"),
        "side": "sell",
        "amount_sol": exit_value_sol,
        "entry_price_sol": entry_price,
        "exit_price_sol": current_price_sol,
        "market_cap_usd": current_market_cap_usd,
        "pnl_sol": round(pnl_sol, 9),
        "pnl_pct": round(pnl_pct, 4),
        "sell_pct": sell_pct,
        "trigger": trigger,
    })

    # Update or close position
    if sell_pct >= 100.0:
        updated_pos = await db.close_position(position["id"])
    else:
        remaining_invested = invested * ((100.0 - sell_pct) / 100.0)
        updated_pos = await db.update_position(position["id"], {
            "amount_sol_invested": round(remaining_invested, 9),
            "status": "partial",
        })
        # Re-open partial → still "open"
        updated_pos = await db.update_position(position["id"], {"status": "open"})

    return updated_pos, trade


# ---------------------------------------------------------------------------
# Position monitoring — background job
# ---------------------------------------------------------------------------

async def monitor_positions(context) -> None:
    """
    Background task: runs every N seconds to check open positions against
    their Stop Loss, Take Profit, Trailing Stop, and Auto Sell conditions.

    Triggered positions are closed automatically and the user is notified.
    """
    try:
        # Collect all open positions across all users
        client = await db.get_client()
        res = await (
            client.table("positions")
            .select("*")
            .eq("status", "open")
            .execute()
        )
        positions = res.data or []

        if not positions:
            return

        # Fetch telegram_ids for all affected users in one query
        user_ids = list({p["user_id"] for p in positions})
        profile_res = await (
            client.table("profiles")
            .select("auth_user_id, telegram_id, telegram_username")
            .in_("auth_user_id", user_ids)
            .execute()
        )
        profile_map: dict[str, dict] = {
            p["auth_user_id"]: p for p in (profile_res.data or [])
        }

        # Group by token address for batched price fetches
        token_addresses: set[str] = {p["token_address"] for p in positions}
        prices = await _batch_fetch_prices(token_addresses)

        triggers: list[TriggerResult] = []

        for pos in positions:
            addr = pos["token_address"]
            price_data = prices.get(addr)
            if price_data is None:
                continue

            current_price = price_data["price_sol"]
            current_mc = price_data["market_cap_usd"]
            entry_price = float(pos["entry_price_sol"])

            if entry_price == 0:
                continue

            pct_change = (current_price - entry_price) / entry_price * 100.0

            # Update trailing-stop high-water mark
            highest = float(pos.get("highest_price_sol") or entry_price)
            new_highest = max(highest, current_price)
            if new_highest != highest:
                await db.update_position(pos["id"], {"highest_price_sol": new_highest})
                pos["highest_price_sol"] = new_highest

            trigger_name = _check_triggers(pos, current_price, pct_change, new_highest)
            if trigger_name is None:
                continue

            # Execute the simulated sell
            profile_row = profile_map.get(pos["user_id"]) or {}
            tg_id = profile_row.get("telegram_id")

            try:
                _, trade = await simulate_sell(
                    user_id=pos["user_id"],
                    challenge_id=pos["challenge_id"],
                    position=pos,
                    sell_pct=100.0,
                    current_price_sol=current_price,
                    current_market_cap_usd=current_mc,
                    trigger=trigger_name,
                )

                invested = float(pos["amount_sol_invested"])
                pnl_sol = float(trade["pnl_sol"])
                pnl_pct = float(trade["pnl_pct"])

                triggers.append(TriggerResult(
                    trigger=trigger_name,
                    position_id=pos["id"],
                    user_id=pos["user_id"],
                    telegram_id=tg_id,
                    token_symbol=pos["token_symbol"],
                    pnl_sol=pnl_sol,
                    pnl_pct=pnl_pct,
                    exit_price_sol=current_price,
                    invested_sol=invested,
                ))
            except Exception as exc:
                log.error("Failed to auto-close position %s: %s", pos["id"], exc)

        # Send Telegram notifications
        for result in triggers:
            if result.telegram_id:
                await _notify_trigger(context, result)

    except Exception as exc:
        log.error("Position monitor error: %s", exc, exc_info=True)


def _check_triggers(
    pos: dict,
    current_price: float,
    pct_change: float,
    highest_price: float,
) -> str | None:
    """
    Check all automatic trigger conditions for a position.
    Returns the trigger name, or None if no trigger fired.
    """
    entry_price = float(pos["entry_price_sol"])

    # Stop Loss
    sl = pos.get("stop_loss_pct")
    if sl is not None and pct_change <= -float(sl):
        return "stop_loss"

    # Take Profit
    tp = pos.get("take_profit_pct")
    if tp is not None and pct_change >= float(tp):
        return "take_profit"

    # Auto Sell
    auto = pos.get("auto_sell_pct")
    if auto is not None and pct_change >= float(auto):
        return "auto_sell"

    # Trailing Stop
    tsl = pos.get("trailing_stop_pct")
    if tsl is not None and highest_price > entry_price:
        drop_from_high = (highest_price - current_price) / highest_price * 100.0
        if drop_from_high >= float(tsl):
            return "trailing_stop"

    return None


async def _batch_fetch_prices(addresses: set[str]) -> dict[str, dict]:
    """
    Fetch current prices for multiple tokens in parallel.
    Returns {address: {price_sol, market_cap_usd}}.
    """
    async def fetch_one(addr: str) -> tuple[str, dict | None]:
        token = await get_token_data(addr)
        if token:
            return addr, {"price_sol": token.price_sol, "market_cap_usd": token.market_cap_usd}
        return addr, None

    results = await asyncio.gather(*[fetch_one(a) for a in addresses], return_exceptions=True)
    prices = {}
    for item in results:
        if isinstance(item, tuple) and item[1] is not None:
            prices[item[0]] = item[1]
    return prices


_TRIGGER_LABELS = {
    "stop_loss":     ("🔴 Stop Loss Triggered", "SL"),
    "take_profit":   ("✅ Take Profit Hit", "TP"),
    "trailing_stop": ("📉 Trailing Stop Triggered", "TSL"),
    "auto_sell":     ("🤖 Auto Sell Executed", "Auto"),
}


async def _notify_trigger(context, result: TriggerResult) -> None:
    """Send a Telegram notification when a position is auto-closed."""
    label, short = _TRIGGER_LABELS.get(result.trigger, ("🔔 Position Closed", ""))
    sign = "+" if result.pnl_sol >= 0 else ""
    emoji = "🟢" if result.pnl_sol >= 0 else "🔴"

    text = (
        f"{label}\n\n"
        f"{emoji} *{result.token_symbol}* [{short}]\n"
        f"PnL: `{sign}{result.pnl_sol:.4f} SOL` ({sign}{result.pnl_pct:.1f}%)\n"
        f"Invested: `{result.invested_sol:.4f} SOL`"
    )
    try:
        await context.bot.send_message(
            chat_id=result.telegram_id,
            text=text,
            parse_mode="Markdown",
        )
    except Exception as exc:
        log.warning("Failed to notify user %s: %s", result.telegram_id, exc)


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def format_hold_time(opened_at: str | datetime) -> str:
    """Convert an ISO timestamp to a human-readable hold duration."""
    if isinstance(opened_at, str):
        opened_at = datetime.fromisoformat(opened_at.replace("Z", "+00:00"))
    delta = datetime.now(timezone.utc) - opened_at
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        m = seconds // 60
        s = seconds % 60
        return f"{m}m {s}s"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{h}h {m}m"


def format_sol(value: float, decimals: int = 4) -> str:
    return f"{value:.{decimals}f} SOL"


def format_usd(value: float) -> str:
    if value >= 1_000_000:
        return f"${value/1_000_000:.2f}M"
    if value >= 1_000:
        return f"${value/1_000:.1f}K"
    return f"${value:.2f}"


def calc_pnl(position: dict, current_price_sol: float) -> tuple[float, float]:
    """
    Calculate unrealised PnL for an open position.
    Returns (pnl_sol, pnl_pct).
    """
    invested = float(position["amount_sol_invested"])
    entry_price = float(position["entry_price_sol"])
    if entry_price == 0:
        return 0.0, 0.0
    price_ratio = current_price_sol / entry_price
    current_value = invested * price_ratio
    pnl_sol = current_value - invested
    pnl_pct = (price_ratio - 1.0) * 100.0
    return round(pnl_sol, 6), round(pnl_pct, 2)
