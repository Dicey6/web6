"""
main.py — FundedFrens Telegram Trading Terminal.

Entry point for the bot. All handlers, conversation flows, and the background
position-monitor job are registered here. UI logic lives in this file;
data access is delegated to database.py and trading logic to trading.py.
"""

import asyncio
import logging
import os
import re
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

from telegram import (
    InlineKeyboardButton, InlineKeyboardMarkup, Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application, CallbackQueryHandler, CommandHandler,
    ContextTypes, ConversationHandler, MessageHandler, filters,
)

import database as db
import pnl as pnl_module
import trading
from config import APP_URL, BOT_TOKEN, LOG_LEVEL, TRADING
from pnl import PnLCardData, ensure_fonts

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Conversation states
# ---------------------------------------------------------------------------

# Buy flow
(
    BUY_ENTER_TOKEN,
    BUY_SELECT_AMOUNT,
    BUY_ENTER_AMOUNT,
    BUY_SET_SL,
    BUY_SET_TP,
    BUY_CONFIRM,
) = range(6)

# Settings flow
SETTINGS_SELECT, SETTINGS_ENTER_VALUE = range(2)

# Edit SL / TP
EDIT_SL_VALUE = 0
EDIT_TP_VALUE = 0


# ---------------------------------------------------------------------------
# Keyboard helpers
# ---------------------------------------------------------------------------

def _kb(rows: list[list[tuple[str, str]]]) -> InlineKeyboardMarkup:
    """Build an InlineKeyboardMarkup from a nested list of (label, callback_data)."""
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton(label, callback_data=data) for label, data in row]
         for row in rows]
    )


_KB_HOME_BACK = _kb([[("← Back to Home", "home")]])


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

async def _get_profile(update: Update) -> dict | None:
    """Return the profile for this Telegram user, or None."""
    user = update.effective_user
    if not user:
        return None
    return await db.get_profile_by_telegram_id(user.id)


async def _require_profile(update: Update, context: ContextTypes.DEFAULT_TYPE) -> dict | None:
    """
    Fetch profile or send the 'link your account' prompt.
    Returns None if the user is not linked.
    """
    profile = await _get_profile(update)
    if profile:
        return profile
    await _send_or_edit(update, context, _UNLINKED_TEXT, reply_markup=_kb([
        [("🔗 How to Link", "howtolink")],
    ]))
    return None


_UNLINKED_TEXT = (
    "👋 *Welcome to FundedFrens Trading Terminal*\n\n"
    "Your Telegram account is not linked to a FundedFrens account yet.\n\n"
    f"1. Visit [{APP_URL}]({APP_URL})\n"
    "2. Go to *Account → Settings*\n"
    "3. Click *Link Telegram*\n"
    "4. Copy the 8-character code\n"
    "5. Send it here: `/link YOURCODE`"
)


async def _require_challenge(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    profile: dict,
) -> dict | None:
    """
    Fetch the user's active challenge. Prompts if none is found.
    Returns None if there is no active challenge.
    """
    challenge = await db.get_active_challenge(profile["auth_user_id"])
    if challenge:
        return challenge

    await _send_or_edit(
        update, context,
        "⚠️ *No Active Challenge*\n\n"
        "You don't have an active funded challenge account.\n"
        f"Purchase a challenge at [{APP_URL}]({APP_URL})",
        reply_markup=_KB_HOME_BACK,
    )
    return None


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

async def _send_or_edit(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str = ParseMode.MARKDOWN,
) -> None:
    """Edit existing message if callback, otherwise send new."""
    if update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.edit_message_text(
            text, reply_markup=reply_markup, parse_mode=parse_mode,
        )
    else:
        msg = update.message or (update.callback_query and update.callback_query.message)
        if msg:
            await msg.reply_text(text, reply_markup=reply_markup, parse_mode=parse_mode)


def _pnl_sign(v: float) -> str:
    return "+" if v >= 0 else ""


def _pnl_emoji(v: float) -> str:
    return "🟢" if v >= 0 else "🔴"


# ---------------------------------------------------------------------------
# /start — Welcome
# ---------------------------------------------------------------------------

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    profile = await _get_profile(update)

    if not profile:
        await update.message.reply_text(
            _UNLINKED_TEXT,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=_kb([[("🔗 How to Link", "howtolink")]]),
            disable_web_page_preview=True,
        )
        return

    await _show_home(update, context, profile)


# ---------------------------------------------------------------------------
# /link <token> — Account linking
# ---------------------------------------------------------------------------

async def cmd_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    args = context.args

    if not args:
        await update.message.reply_text(
            "Usage: `/link YOURCODE`\n\n"
            f"Get your linking code at [{APP_URL}]({APP_URL}) → Account → Link Telegram",
            parse_mode=ParseMode.MARKDOWN,
            disable_web_page_preview=True,
        )
        return

    token = args[0].strip().upper()

    # Look up profile by token
    profile = await db.get_profile_by_link_token(token)
    if not profile:
        await update.message.reply_text(
            "❌ *Invalid or expired code.*\n\n"
            "Codes expire after 10 minutes. Please generate a new one.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    # Check token age (10-minute window)
    updated_raw = profile.get("updated_at", "")
    if updated_raw:
        try:
            updated_at = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
            if age_seconds > 600:
                await update.message.reply_text(
                    "❌ *Code expired.* Please generate a new linking code on the website.",
                    parse_mode=ParseMode.MARKDOWN,
                )
                return
        except Exception:
            pass  # If we can't parse the time, allow the link

    # Check not already linked to another account
    existing = await db.get_profile_by_telegram_id(user.id)
    if existing and existing["id"] != profile["id"]:
        await update.message.reply_text(
            "⚠️ This Telegram account is already linked to a different FundedFrens account.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    # Perform the link
    await db.link_telegram(profile["id"], user.id, user.username)

    await update.message.reply_text(
        f"✅ *Account Linked!*\n\n"
        f"Welcome, *{profile.get('username') or profile.get('email', 'Trader')}*!\n\n"
        "You now have access to the FundedFrens Trading Terminal.\n"
        "Use the menu below to start trading.",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("🏠 Open Terminal", "home")]]),
    )


# ---------------------------------------------------------------------------
# Home screen
# ---------------------------------------------------------------------------

async def _show_home(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    profile: dict | None = None,
) -> None:
    if not profile:
        profile = await _require_profile(update, context)
        if not profile:
            return

    challenge = await db.get_active_challenge(profile["auth_user_id"])
    if not challenge:
        await _send_or_edit(
            update, context,
            "⚠️ *No Active Challenge*\n\n"
            "You don't have an active challenge account.\n"
            f"[Purchase a challenge]({APP_URL})",
            reply_markup=None,
        )
        return

    summary = await db.get_account_summary(profile["auth_user_id"], challenge)
    positions = summary["open_positions"]
    n_pos = len(positions)
    plan = summary["plan"]

    # Calculate unrealised PnL across all open positions
    unrealized_sol = 0.0
    for pos in positions:
        price_data = await trading.get_token_data(pos["token_address"])
        if price_data:
            pnl_sol, _ = trading.calc_pnl(pos, price_data.price_sol)
            unrealized_sol += pnl_sol

    total_pnl = summary["realized_pnl"] + unrealized_sol
    balance = summary["available_sol"]

    sign = _pnl_sign(total_pnl)
    pnl_emoji = _pnl_emoji(total_pnl)
    username = profile.get("username") or "Trader"

    text = (
        f"🏦 *FundedFrens Terminal*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 {username}\n\n"
        f"💰 Balance: `{balance:.4f} SOL`\n"
        f"{pnl_emoji} PnL: `{sign}{total_pnl:.4f} SOL`\n"
        f"📋 Positions: `{n_pos}/{TRADING.max_open_positions}`\n"
    )

    pos_label = f"📋 Positions ({n_pos})" if n_pos else "📋 Positions"
    keyboard = _kb([
        [("🟢 Buy", "buy"), ("🔴 Sell", "sell")],
        [(pos_label, "positions"), ("💼 Portfolio", "portfolio")],
        [("⚙️ Settings", "settings")],
    ])

    await _send_or_edit(update, context, text, reply_markup=keyboard)


async def cb_home(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    profile = await _require_profile(update, context)
    if not profile:
        return
    await _show_home(update, context, profile)


async def cb_how_to_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.callback_query.answer()
    await update.callback_query.edit_message_text(
        "🔗 *How to Link Your Account*\n\n"
        f"1. Visit {APP_URL}\n"
        "2. Log in to your account\n"
        "3. Go to *Account → Settings*\n"
        "4. Click *Link Telegram*\n"
        "5. Copy the 8-character code\n"
        "6. Come back here and send: `/link YOURCODE`\n\n"
        "Codes expire after 10 minutes.",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("← Back", "home")]]),
    )


# ---------------------------------------------------------------------------
# Buy conversation
# ---------------------------------------------------------------------------

async def buy_entry(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Start the buy conversation."""
    profile = await _require_profile(update, context)
    if not profile:
        return ConversationHandler.END

    challenge = await _require_challenge(update, context, profile)
    if not challenge:
        return ConversationHandler.END

    # Check position limit
    n_pos = await db.count_open_positions(profile["auth_user_id"])
    if n_pos >= TRADING.max_open_positions:
        await _send_or_edit(
            update, context,
            f"⛔ *Position Limit Reached*\n\n"
            f"Maximum {TRADING.max_open_positions} open positions allowed.\n"
            "Close an existing position before opening a new one.",
            reply_markup=_kb([
                [("📋 View Positions", "positions"), ("← Home", "home")]
            ]),
        )
        return ConversationHandler.END

    context.user_data.clear()
    context.user_data["profile"] = profile
    context.user_data["challenge"] = challenge

    await _send_or_edit(
        update, context,
        "🟢 *Buy — Step 1 of 3*\n\n"
        "Enter a *token contract address* or type a symbol to search:\n\n"
        "_Example: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`_",
        reply_markup=_kb([[("✖️ Cancel", "home")]]),
    )
    return BUY_ENTER_TOKEN


async def buy_receive_token(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User sent a token address or search query."""
    text = (update.message.text or "").strip()

    await update.message.reply_text("🔍 Looking up token...")

    # If it looks like an address, fetch directly
    if re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", text):
        ok, error, token = await trading.validate_token(text)
        if not ok:
            await update.message.reply_text(
                error,
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=_kb([[("Try Again", "buy"), ("✖️ Cancel", "home")]]),
            )
            return BUY_ENTER_TOKEN
        return await _show_token_and_amounts(update, context, token)

    # Search mode
    results = await trading.search_tokens(text)
    if not results:
        await update.message.reply_text(
            f"❌ No tokens found for *{text}*.\n\nTry the contract address directly.",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=_kb([[("✖️ Cancel", "home")]]),
        )
        return BUY_ENTER_TOKEN

    if len(results) == 1:
        ok, error, token = await trading.validate_token(results[0].address)
        if not ok:
            await update.message.reply_text(error, parse_mode=ParseMode.MARKDOWN)
            return BUY_ENTER_TOKEN
        return await _show_token_and_amounts(update, context, token)

    # Multiple results — let user pick
    buttons = [
        [(f"{r.symbol} — {trading.format_usd(r.market_cap_usd)} MC", f"pick_{r.address}")]
        for r in results
    ]
    buttons.append([("✖️ Cancel", "home")])
    await update.message.reply_text(
        f"Found {len(results)} tokens. Select one:",
        reply_markup=_kb(buttons),
    )
    context.user_data["search_results"] = {r.address: r for r in results}
    return BUY_SELECT_AMOUNT


async def buy_pick_search_result(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User selected a token from search results."""
    await update.callback_query.answer()
    address = update.callback_query.data.removeprefix("pick_")
    results = context.user_data.get("search_results", {})
    token = results.get(address)
    if not token:
        ok, error, token = await trading.validate_token(address)
        if not ok:
            await update.callback_query.edit_message_text(error, parse_mode=ParseMode.MARKDOWN)
            return BUY_ENTER_TOKEN
    return await _show_token_and_amounts(update, context, token)


async def _show_token_and_amounts(update, context, token) -> int:
    """Display token info and preset buy-amount buttons."""
    context.user_data["buy_token"] = token
    settings = await db.get_bot_settings(context.user_data["profile"]["auth_user_id"])
    default_sol = float(settings.get("default_buy_sol", 0.1))

    presets = sorted({0.1, 0.25, 0.5, 1.0, default_sol})
    preset_buttons = [(f"{v} SOL", f"amt_{v}") for v in presets]
    preset_rows = [preset_buttons[i:i+3] for i in range(0, len(preset_buttons), 3)]
    preset_rows.append([("✏️ Custom", "amt_custom"), ("✖️ Cancel", "home")])

    mc_str = trading.format_usd(token.market_cap_usd)
    liq_str = trading.format_usd(token.liquidity_usd)

    text = (
        f"🟢 *Buy — Step 2 of 3*\n\n"
        f"*{token.symbol}* — {token.name}\n"
        f"📊 MC: `{mc_str}` | Liq: `{liq_str}`\n"
        f"💱 Price: `{token.price_sol:.8f} SOL`\n"
        f"📈 24h: `{_pnl_sign(token.price_change_24h)}{token.price_change_24h:.1f}%`\n\n"
        "Select buy amount:"
    )

    await _send_or_edit(update, context, text, reply_markup=_kb(preset_rows))
    return BUY_SELECT_AMOUNT


async def buy_select_amount(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User tapped a preset amount or 'Custom'."""
    await update.callback_query.answer()
    data = update.callback_query.data

    if data == "amt_custom":
        await update.callback_query.edit_message_text(
            "🟢 *Buy — Custom Amount*\n\n"
            "Enter the SOL amount to invest:\n_Example: `0.35`_",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=_kb([[("✖️ Cancel", "home")]]),
        )
        return BUY_ENTER_AMOUNT

    try:
        amount = float(data.removeprefix("amt_"))
    except ValueError:
        return BUY_SELECT_AMOUNT

    return await _validate_amount_and_continue(update, context, amount)


async def buy_enter_custom_amount(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User typed a custom SOL amount."""
    raw = (update.message.text or "").strip()
    try:
        amount = float(raw)
    except ValueError:
        await update.message.reply_text(
            "❌ Invalid amount. Please enter a number like `0.25`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return BUY_ENTER_AMOUNT
    return await _validate_amount_and_continue(update, context, amount)


async def _validate_amount_and_continue(update, context, amount: float) -> int:
    """Validate the buy amount against position sizing rules."""
    profile = context.user_data["profile"]
    challenge = context.user_data["challenge"]
    summary = await db.get_account_summary(profile["auth_user_id"], challenge)

    if amount <= 0:
        await _send_or_edit(update, context, "❌ Amount must be greater than 0.")
        return BUY_ENTER_AMOUNT

    # 30% allocation limit
    max_allowed = summary["start_balance"] * (TRADING.max_allocation_pct / 100)
    if amount > max_allowed:
        await _send_or_edit(
            update, context,
            f"⛔ *Allocation Limit*\n\n"
            f"Maximum {TRADING.max_allocation_pct:.0f}% per position.\n"
            f"Max allowed: `{max_allowed:.4f} SOL`\n"
            f"Your request: `{amount:.4f} SOL`",
            reply_markup=_kb([[("← Try Again", "buy")]]),
        )
        return ConversationHandler.END

    if amount > summary["available_sol"]:
        await _send_or_edit(
            update, context,
            f"⛔ *Insufficient Balance*\n\n"
            f"Available: `{summary['available_sol']:.4f} SOL`\n"
            f"Requested: `{amount:.4f} SOL`",
            reply_markup=_kb([[("← Try Again", "buy")]]),
        )
        return ConversationHandler.END

    context.user_data["buy_amount"] = amount
    settings = await db.get_bot_settings(profile["auth_user_id"])
    default_sl = float(settings.get("default_sl_pct") or 20)

    await _send_or_edit(
        update, context,
        f"🟢 *Buy — Step 3 of 3 (Risk)*\n\n"
        f"Amount: `{amount:.4f} SOL`\n\n"
        "Set *Stop Loss* %:",
        reply_markup=_kb([
            [(f"Default ({default_sl:.0f}%)", f"sl_{default_sl}"),
             ("None", "sl_none"), ("Custom", "sl_custom")],
            [("✖️ Cancel", "home")],
        ]),
    )
    return BUY_SET_SL


async def buy_set_sl(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle SL selection."""
    data = update.callback_query.data if update.callback_query else ""

    if update.callback_query:
        await update.callback_query.answer()

    if data == "sl_none":
        context.user_data["buy_sl"] = None
    elif data == "sl_custom":
        await _send_or_edit(
            update, context,
            "Enter your Stop Loss %:\n_Example: `15` for 15%_",
            reply_markup=_kb([[("✖️ Cancel", "home")]]),
        )
        context.user_data["awaiting"] = "sl"
        return BUY_SET_SL
    elif data.startswith("sl_"):
        context.user_data["buy_sl"] = float(data.removeprefix("sl_"))
    elif context.user_data.get("awaiting") == "sl":
        # Custom SL text input
        raw = (update.message.text or "").strip()
        try:
            sl = float(raw)
            if not 0 < sl <= 99:
                raise ValueError
            context.user_data["buy_sl"] = sl
            context.user_data.pop("awaiting", None)
        except ValueError:
            await update.message.reply_text("❌ Enter a number between 1 and 99.")
            return BUY_SET_SL

    return await _ask_tp(update, context)


async def _ask_tp(update, context) -> int:
    settings = await db.get_bot_settings(context.user_data["profile"]["auth_user_id"])
    default_tp = float(settings.get("default_tp_pct") or 50)

    await _send_or_edit(
        update, context,
        "Set *Take Profit* %:",
        reply_markup=_kb([
            [(f"Default ({default_tp:.0f}%)", f"tp_{default_tp}"),
             ("None", "tp_none"), ("Custom", "tp_custom")],
            [("✖️ Cancel", "home")],
        ]),
    )
    return BUY_SET_TP


async def buy_set_tp(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = update.callback_query.data if update.callback_query else ""

    if update.callback_query:
        await update.callback_query.answer()

    if data == "tp_none":
        context.user_data["buy_tp"] = None
    elif data == "tp_custom":
        await _send_or_edit(
            update, context,
            "Enter your Take Profit %:\n_Example: `80` for 80%_",
            reply_markup=_kb([[("✖️ Cancel", "home")]]),
        )
        context.user_data["awaiting"] = "tp"
        return BUY_SET_TP
    elif data.startswith("tp_"):
        context.user_data["buy_tp"] = float(data.removeprefix("tp_"))
    elif context.user_data.get("awaiting") == "tp":
        raw = (update.message.text or "").strip()
        try:
            tp = float(raw)
            if not 0 < tp <= 10000:
                raise ValueError
            context.user_data["buy_tp"] = tp
            context.user_data.pop("awaiting", None)
        except ValueError:
            await update.message.reply_text("❌ Enter a positive number.")
            return BUY_SET_TP

    return await _show_buy_confirm(update, context)


async def _show_buy_confirm(update, context) -> int:
    token: trading.TokenData = context.user_data["buy_token"]
    amount: float = context.user_data["buy_amount"]
    sl: float | None = context.user_data.get("buy_sl")
    tp: float | None = context.user_data.get("buy_tp")

    sl_str = f"{sl:.0f}%" if sl is not None else "None"
    tp_str = f"{tp:.0f}%" if tp is not None else "None"

    text = (
        "🟢 *Confirm Buy*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"Token: *{token.symbol}*\n"
        f"MC: `{trading.format_usd(token.market_cap_usd)}`\n"
        f"Price: `{token.price_sol:.8f} SOL`\n"
        f"Invest: `{amount:.4f} SOL`\n"
        f"SL: `{sl_str}` | TP: `{tp_str}`\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "_Simulated trade — no real assets are at risk._"
    )

    await _send_or_edit(
        update, context, text,
        reply_markup=_kb([
            [("✅ Confirm Buy", "confirm_buy"), ("✖️ Cancel", "home")],
        ]),
    )
    return BUY_CONFIRM


async def buy_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Execute the simulated buy."""
    await update.callback_query.answer("Processing...")

    profile = context.user_data["profile"]
    challenge = context.user_data["challenge"]
    token: trading.TokenData = context.user_data["buy_token"]
    amount: float = context.user_data["buy_amount"]
    sl: float | None = context.user_data.get("buy_sl")
    tp: float | None = context.user_data.get("buy_tp")

    try:
        position = await trading.simulate_buy(
            user_id=profile["auth_user_id"],
            challenge_id=challenge["id"],
            token=token,
            amount_sol=amount,
            sl_pct=sl,
            tp_pct=tp,
        )
    except Exception as exc:
        log.error("Buy failed: %s", exc, exc_info=True)
        await update.callback_query.edit_message_text(
            "❌ Trade failed. Please try again.",
            reply_markup=_KB_HOME_BACK,
        )
        return ConversationHandler.END

    sl_str = f"{sl:.0f}%" if sl is not None else "—"
    tp_str = f"{tp:.0f}%" if tp is not None else "—"

    await update.callback_query.edit_message_text(
        f"✅ *Trade Executed*\n\n"
        f"🟢 Bought *{token.symbol}*\n"
        f"Invested: `{amount:.4f} SOL`\n"
        f"Entry MC: `{trading.format_usd(token.market_cap_usd)}`\n"
        f"SL: `{sl_str}` | TP: `{tp_str}`\n\n"
        "_Your position is now open and being monitored._",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([
            [("📋 View Positions", "positions"), ("🏠 Home", "home")],
        ]),
    )
    context.user_data.clear()
    return ConversationHandler.END


async def buy_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# Positions view
# ---------------------------------------------------------------------------

async def cb_positions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    profile = await _require_profile(update, context)
    if not profile:
        return

    positions = await db.get_open_positions(profile["auth_user_id"])
    if not positions:
        await _send_or_edit(
            update, context,
            "📋 *No Open Positions*\n\nYou have no active trades right now.",
            reply_markup=_kb([
                [("🟢 Buy", "buy"), ("🏠 Home", "home")],
            ]),
        )
        return

    lines = [f"📋 *Open Positions* ({len(positions)}/{TRADING.max_open_positions})\n"]
    buttons = []
    for pos in positions:
        price_data = await trading.get_token_data(pos["token_address"])
        if price_data:
            pnl_sol, pnl_pct = trading.calc_pnl(pos, price_data.price_sol)
            sign = _pnl_sign(pnl_sol)
            emoji = _pnl_emoji(pnl_sol)
            lines.append(f"{emoji} *{pos['token_symbol']}* — `{sign}{pnl_pct:.1f}%`")
            label = f"{pos['token_symbol']} {sign}{pnl_pct:.1f}%"
        else:
            lines.append(f"⏳ *{pos['token_symbol']}* — Loading...")
            label = pos["token_symbol"]
        buttons.append([(label, f"pos_{pos['id']}")])

    buttons.append([("🏠 Home", "home")])
    await _send_or_edit(
        update, context, "\n".join(lines), reply_markup=_kb(buttons),
    )


async def cb_position_detail(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show full position detail with action buttons."""
    await update.callback_query.answer()
    profile = await _require_profile(update, context)
    if not profile:
        return

    pos_id = int(update.callback_query.data.removeprefix("pos_"))
    pos = await db.get_position_by_id(pos_id, profile["auth_user_id"])
    if not pos:
        await update.callback_query.edit_message_text("Position not found.")
        return

    price_data = await trading.get_token_data(pos["token_address"])
    hold_time = trading.format_hold_time(pos["opened_at"])

    if price_data:
        pnl_sol, pnl_pct = trading.calc_pnl(pos, price_data.price_sol)
        cur_mc = trading.format_usd(price_data.market_cap_usd)
        cur_price = f"{price_data.price_sol:.8f} SOL"
    else:
        pnl_sol, pnl_pct = 0.0, 0.0
        cur_mc = "—"
        cur_price = "—"

    entry_mc = trading.format_usd(float(pos.get("entry_market_cap_usd") or 0))
    invested = float(pos["amount_sol_invested"])
    sl = pos.get("stop_loss_pct")
    tp = pos.get("take_profit_pct")
    sl_str = f"{float(sl):.0f}%" if sl else "None"
    tp_str = f"{float(tp):.0f}%" if tp else "None"
    sign = _pnl_sign(pnl_sol)
    emoji = _pnl_emoji(pnl_sol)

    text = (
        f"📊 *{pos['token_symbol']}*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Entry MC: `{entry_mc}` → `{cur_mc}`\n"
        f"Price: `{cur_price}`\n"
        f"PnL: `{sign}{pnl_pct:.2f}%` | `{sign}{pnl_sol:.4f} SOL`\n"
        f"Size: `{invested:.4f} SOL` | Hold: `{hold_time}`\n"
        f"SL: `{sl_str}` | TP: `{tp_str}`\n"
    )

    keyboard = _kb([
        [("✏️ Edit SL", f"edit_sl_{pos_id}"), ("✏️ Edit TP", f"edit_tp_{pos_id}")],
        [(f"Close 25%", f"close_{pos_id}_25"),
         (f"Close 50%", f"close_{pos_id}_50"),
         (f"Close 100%", f"close_{pos_id}_100")],
        [("📊 PnL Card", f"pnl_pos_{pos_id}"), ("← Back", "positions")],
    ])
    await update.callback_query.edit_message_text(
        text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard,
    )


async def cb_close_position(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Close N% of a position."""
    await update.callback_query.answer("Processing...")
    profile = await _require_profile(update, context)
    if not profile:
        return

    # data format: "close_{pos_id}_{pct}"
    parts = update.callback_query.data.split("_")   # ["close", "{id}", "{pct}"]
    pos_id = int(parts[1])
    sell_pct = float(parts[2])

    pos = await db.get_position_by_id(pos_id, profile["auth_user_id"])
    if not pos:
        await update.callback_query.edit_message_text("❌ Position not found.")
        return

    challenge = await db.get_active_challenge(profile["auth_user_id"])
    if not challenge:
        return

    price_data = await trading.get_token_data(pos["token_address"])
    if not price_data:
        await update.callback_query.edit_message_text(
            "❌ Could not fetch current price. Try again.",
            reply_markup=_KB_HOME_BACK,
        )
        return

    _, trade = await trading.simulate_sell(
        user_id=profile["auth_user_id"],
        challenge_id=challenge["id"],
        position=pos,
        sell_pct=sell_pct,
        current_price_sol=price_data.price_sol,
        current_market_cap_usd=price_data.market_cap_usd,
        trigger="manual",
    )

    pnl_sol = float(trade["pnl_sol"])
    pnl_pct = float(trade["pnl_pct"])
    sign = _pnl_sign(pnl_sol)
    emoji = _pnl_emoji(pnl_sol)

    action = "Closed" if sell_pct == 100 else f"Closed {sell_pct:.0f}% of"
    await update.callback_query.edit_message_text(
        f"{'✅' if pnl_sol >= 0 else '🔴'} *{action} {pos['token_symbol']}*\n\n"
        f"PnL: `{sign}{pnl_sol:.4f} SOL` ({sign}{pnl_pct:.2f}%)\n"
        f"Exit MC: `{trading.format_usd(price_data.market_cap_usd)}`",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([
            [("📊 PnL Card", f"pnl_trade_{trade['id']}"), ("📋 Positions", "positions")],
            [("🏠 Home", "home")],
        ]),
    )


# ---------------------------------------------------------------------------
# Edit SL / TP
# ---------------------------------------------------------------------------

async def cb_edit_sl_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.callback_query.answer()
    pos_id = int(update.callback_query.data.removeprefix("edit_sl_"))
    context.user_data["edit_pos_id"] = pos_id
    context.user_data["edit_field"] = "sl"
    await update.callback_query.edit_message_text(
        "✏️ Enter new *Stop Loss* %:\n_Example: `15` for 15%_\n\nSend `0` to disable.",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("✖️ Cancel", f"pos_{pos_id}")]]),
    )
    return EDIT_SL_VALUE


async def cb_edit_tp_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.callback_query.answer()
    pos_id = int(update.callback_query.data.removeprefix("edit_tp_"))
    context.user_data["edit_pos_id"] = pos_id
    context.user_data["edit_field"] = "tp"
    await update.callback_query.edit_message_text(
        "✏️ Enter new *Take Profit* %:\n_Example: `100` for 100%_\n\nSend `0` to disable.",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("✖️ Cancel", f"pos_{pos_id}")]]),
    )
    return EDIT_TP_VALUE


async def cb_edit_sl_tp_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle SL or TP value input."""
    raw = (update.message.text or "").strip()
    pos_id = context.user_data.get("edit_pos_id")
    field = context.user_data.get("edit_field")
    profile = await _get_profile(update)

    try:
        val = float(raw)
        if val < 0 or val > 10000:
            raise ValueError
    except ValueError:
        await update.message.reply_text("❌ Enter a valid number (0 to disable).")
        return EDIT_SL_VALUE if field == "sl" else EDIT_TP_VALUE

    update_key = "stop_loss_pct" if field == "sl" else "take_profit_pct"
    new_val = None if val == 0 else val
    await db.update_position(pos_id, {update_key: new_val})

    label = "Stop Loss" if field == "sl" else "Take Profit"
    val_str = f"{val:.0f}%" if new_val else "Disabled"
    await update.message.reply_text(
        f"✅ *{label}* updated to `{val_str}`",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("← View Position", f"pos_{pos_id}"), ("🏠 Home", "home")]]),
    )
    context.user_data.clear()
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

async def cb_portfolio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    profile = await _require_profile(update, context)
    if not profile:
        return

    challenge = await _require_challenge(update, context, profile)
    if not challenge:
        return

    summary = await db.get_account_summary(profile["auth_user_id"], challenge)
    positions = summary["open_positions"]

    total_current_value = 0.0
    unrealized_pnl = 0.0
    lines = []

    for pos in positions:
        price_data = await trading.get_token_data(pos["token_address"])
        invested = float(pos["amount_sol_invested"])
        if price_data:
            pnl_sol, pnl_pct = trading.calc_pnl(pos, price_data.price_sol)
            cur_val = invested + pnl_sol
            total_current_value += cur_val
            unrealized_pnl += pnl_sol
            sign = _pnl_sign(pnl_sol)
            emoji = _pnl_emoji(pnl_sol)
            lines.append(
                f"{emoji} *{pos['token_symbol']}*: `{invested:.3f}` → "
                f"`{cur_val:.3f} SOL` ({sign}{pnl_pct:.1f}%)"
            )
        else:
            total_current_value += invested
            lines.append(f"⏳ *{pos['token_symbol']}*: `{invested:.3f} SOL` (price unavailable)")

    plan = summary["plan"]
    start_balance = float(plan.get("funded_sol", 0))
    realized = summary["realized_pnl"]
    total_pnl = realized + unrealized_pnl
    portfolio_val = summary["available_sol"] + total_current_value

    sign_t = _pnl_sign(total_pnl)
    sign_u = _pnl_sign(unrealized_pnl)
    sign_r = _pnl_sign(realized)

    text = (
        "💼 *Portfolio*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"Account Size: `{start_balance:.4f} SOL`\n"
        f"Portfolio Value: `{portfolio_val:.4f} SOL`\n"
        f"  ↳ Available: `{summary['available_sol']:.4f} SOL`\n"
        f"  ↳ Invested: `{summary['invested_sol']:.4f} SOL`\n\n"
        f"Realized PnL: `{sign_r}{realized:.4f} SOL`\n"
        f"Unrealized PnL: `{sign_u}{unrealized_pnl:.4f} SOL`\n"
        f"Total PnL: `{sign_t}{total_pnl:.4f} SOL`\n"
    )

    if lines:
        text += "\n━━━━━━━━━━━━━━━━━━━━\n" + "\n".join(lines)

    await _send_or_edit(
        update, context, text,
        reply_markup=_kb([[("📋 Positions", "positions"), ("🏠 Home", "home")]]),
    )


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

async def cb_settings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    profile = await _require_profile(update, context)
    if not profile:
        return ConversationHandler.END

    settings = await db.get_bot_settings(profile["auth_user_id"])
    buy_sol = float(settings.get("default_buy_sol", 0.1))
    sl_pct = settings.get("default_sl_pct")
    tp_pct = settings.get("default_tp_pct")
    auto_pct = settings.get("default_auto_sell_pct")

    sl_str = f"{float(sl_pct):.0f}%" if sl_pct else "None"
    tp_str = f"{float(tp_pct):.0f}%" if tp_pct else "None"
    auto_str = f"{float(auto_pct):.0f}%" if auto_pct else "Off"

    context.user_data["profile"] = profile

    text = (
        "⚙️ *Trading Settings*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"Default Buy: `{buy_sol:.2f} SOL`\n"
        f"Default SL: `{sl_str}`\n"
        f"Default TP: `{tp_str}`\n"
        f"Auto Sell: `{auto_str}`\n"
    )

    keyboard = _kb([
        [("💰 Buy Amount", "sett_buy"), ("🛡 Stop Loss", "sett_sl")],
        [("🎯 Take Profit", "sett_tp"), ("🤖 Auto Sell", "sett_auto")],
        [("🏠 Home", "home")],
    ])
    await _send_or_edit(update, context, text, reply_markup=keyboard)
    return SETTINGS_SELECT


async def settings_field_selected(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.callback_query.answer()
    data = update.callback_query.data
    field_map = {
        "sett_buy":  ("default_buy_sol",       "Default Buy Amount (SOL)", "e.g. `0.25`"),
        "sett_sl":   ("default_sl_pct",         "Default Stop Loss %",      "e.g. `20` or `0` to disable"),
        "sett_tp":   ("default_tp_pct",         "Default Take Profit %",    "e.g. `50` or `0` to disable"),
        "sett_auto": ("default_auto_sell_pct",  "Default Auto Sell %",      "e.g. `100` or `0` to disable"),
    }
    if data not in field_map:
        return SETTINGS_SELECT

    db_key, label, example = field_map[data]
    context.user_data["settings_field"] = db_key
    await update.callback_query.edit_message_text(
        f"⚙️ *Edit {label}*\n\n_{example}_",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("✖️ Cancel", "settings")]]),
    )
    return SETTINGS_ENTER_VALUE


async def settings_receive_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    raw = (update.message.text or "").strip()
    field = context.user_data.get("settings_field")
    profile = context.user_data.get("profile")
    if not field or not profile:
        return ConversationHandler.END

    try:
        val = float(raw)
        if val < 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("❌ Please enter a valid positive number.")
        return SETTINGS_ENTER_VALUE

    new_val = None if val == 0 else val
    await db.update_bot_settings(profile["auth_user_id"], {field: new_val})

    field_labels = {
        "default_buy_sol":       "Buy Amount",
        "default_sl_pct":        "Stop Loss",
        "default_tp_pct":        "Take Profit",
        "default_auto_sell_pct": "Auto Sell",
    }
    label = field_labels.get(field, field)
    val_str = (
        f"{val:.2f} SOL" if field == "default_buy_sol"
        else (f"{val:.0f}%" if new_val else "Disabled")
    )
    await update.message.reply_text(
        f"✅ *{label}* updated to `{val_str}`",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb([[("⚙️ Settings", "settings"), ("🏠 Home", "home")]]),
    )
    context.user_data.clear()
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# PnL Cards
# ---------------------------------------------------------------------------

async def cb_pnl_position(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Generate a live PnL card for an open position."""
    await update.callback_query.answer("Generating card...")
    profile = await _require_profile(update, context)
    if not profile:
        return

    pos_id = int(update.callback_query.data.removeprefix("pnl_pos_"))
    pos = await db.get_position_by_id(pos_id, profile["auth_user_id"])
    if not pos:
        await update.callback_query.edit_message_text("Position not found.")
        return

    price_data = await trading.get_token_data(pos["token_address"])
    if not price_data:
        await update.callback_query.edit_message_text(
            "❌ Could not fetch current price.", reply_markup=_KB_HOME_BACK
        )
        return

    pnl_sol, pnl_pct = trading.calc_pnl(pos, price_data.price_sol)
    invested = float(pos["amount_sol_invested"])
    current_val = invested + pnl_sol
    hold_time = trading.format_hold_time(pos["opened_at"])
    username = profile.get("username") or profile.get("email", "trader").split("@")[0]

    card_data = PnLCardData(
        card_type="live",
        username=username,
        token_symbol=pos["token_symbol"],
        token_name=pos.get("token_name") or pos["token_symbol"],
        entry_market_cap_usd=float(pos.get("entry_market_cap_usd") or 0),
        current_market_cap_usd=price_data.market_cap_usd,
        invested_sol=invested,
        current_value_sol=current_val,
        profit_pct=pnl_pct,
        profit_sol=pnl_sol,
        hold_time=hold_time,
        token_logo_url=pos.get("token_logo_url"),
    )

    try:
        card_bytes = await pnl_module.generate_pnl_card(card_data)
        await update.effective_chat.send_photo(
            photo=card_bytes,
            caption=f"📊 *{pos['token_symbol']}* — Live PnL Card",
            parse_mode=ParseMode.MARKDOWN,
        )
    except Exception as exc:
        log.error("PnL card generation failed: %s", exc, exc_info=True)
        await update.callback_query.edit_message_text(
            "❌ Card generation failed.", reply_markup=_KB_HOME_BACK
        )


async def cb_pnl_trade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Generate a closed-trade PnL card."""
    await update.callback_query.answer("Generating card...")
    profile = await _require_profile(update, context)
    if not profile:
        return

    trade_id = int(update.callback_query.data.removeprefix("pnl_trade_"))
    trade = await db.get_trade(trade_id, profile["auth_user_id"])
    if not trade or trade["side"] != "sell":
        await update.callback_query.edit_message_text("Trade not found.")
        return

    # Fetch the related open position for entry MC
    pos = None
    if trade.get("position_id"):
        pos = await db.get_position_by_id(trade["position_id"], profile["auth_user_id"])

    entry_mc = float(pos["entry_market_cap_usd"]) if pos and pos.get("entry_market_cap_usd") else 0
    exit_mc = float(trade.get("market_cap_usd") or 0)
    invested = float(trade["amount_sol"]) - float(trade.get("pnl_sol") or 0)
    exit_val = float(trade["amount_sol"])
    pnl_sol = float(trade.get("pnl_sol") or 0)
    pnl_pct = float(trade.get("pnl_pct") or 0)
    username = profile.get("username") or profile.get("email", "trader").split("@")[0]

    hold_time = "—"
    if pos and pos.get("opened_at") and trade.get("created_at"):
        try:
            opened = datetime.fromisoformat(pos["opened_at"].replace("Z", "+00:00"))
            closed = datetime.fromisoformat(trade["created_at"].replace("Z", "+00:00"))
            delta = int((closed - opened).total_seconds())
            if delta >= 3600:
                hold_time = f"{delta//3600}h {(delta%3600)//60}m"
            else:
                hold_time = f"{delta//60}m {delta%60}s"
        except Exception:
            pass

    card_data = PnLCardData(
        card_type="closed",
        username=username,
        token_symbol=trade["token_symbol"],
        token_name=trade.get("token_name") or trade["token_symbol"],
        entry_market_cap_usd=entry_mc,
        current_market_cap_usd=exit_mc,
        invested_sol=invested,
        current_value_sol=exit_val,
        profit_pct=pnl_pct,
        profit_sol=pnl_sol,
        hold_time=hold_time,
        token_logo_url=None,
    )

    try:
        card_bytes = await pnl_module.generate_pnl_card(card_data)
        await update.effective_chat.send_photo(
            photo=card_bytes,
            caption=f"📊 *{trade['token_symbol']}* — Closed Trade",
            parse_mode=ParseMode.MARKDOWN,
        )
    except Exception as exc:
        log.error("PnL card generation failed: %s", exc, exc_info=True)
        await update.callback_query.edit_message_text(
            "❌ Card generation failed.", reply_markup=_KB_HOME_BACK
        )


# ---------------------------------------------------------------------------
# Sell shortcut (shows positions)
# ---------------------------------------------------------------------------

async def cb_sell(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """'Sell' button from home — shows open positions for selection."""
    profile = await _require_profile(update, context)
    if not profile:
        return

    positions = await db.get_open_positions(profile["auth_user_id"])
    if not positions:
        await _send_or_edit(
            update, context,
            "🔴 *Sell*\n\nYou have no open positions to sell.",
            reply_markup=_kb([[("🟢 Buy", "buy"), ("🏠 Home", "home")]]),
        )
        return

    lines = ["🔴 *Sell — Select Position*\n"]
    buttons = []
    for pos in positions:
        price_data = await trading.get_token_data(pos["token_address"])
        if price_data:
            pnl_sol, pnl_pct = trading.calc_pnl(pos, price_data.price_sol)
            sign = _pnl_sign(pnl_sol)
            emoji = _pnl_emoji(pnl_sol)
            label = f"{emoji} {pos['token_symbol']} {sign}{pnl_pct:.1f}%"
        else:
            label = f"⏳ {pos['token_symbol']}"
        buttons.append([(label, f"pos_{pos['id']}")])

    buttons.append([("🏠 Home", "home")])
    await _send_or_edit(update, context, "\n".join(lines), reply_markup=_kb(buttons))


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    log.error("Update caused error: %s", context.error, exc_info=context.error)
    if isinstance(update, Update) and update.effective_message:
        await update.effective_message.reply_text(
            "⚠️ Something went wrong. Please try again or go /start"
        )


# ---------------------------------------------------------------------------
# Application setup
# ---------------------------------------------------------------------------

def build_application() -> Application:
    app = Application.builder().token(BOT_TOKEN).build()

    # ── Buy conversation ────────────────────────────────────────────────────
    buy_conv = ConversationHandler(
        entry_points=[
            CallbackQueryHandler(buy_entry, pattern="^buy$"),
        ],
        states={
            BUY_ENTER_TOKEN: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, buy_receive_token),
                CallbackQueryHandler(buy_pick_search_result, pattern=r"^pick_"),
            ],
            BUY_SELECT_AMOUNT: [
                CallbackQueryHandler(buy_select_amount, pattern=r"^amt_"),
                CallbackQueryHandler(buy_pick_search_result, pattern=r"^pick_"),
            ],
            BUY_ENTER_AMOUNT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, buy_enter_custom_amount),
            ],
            BUY_SET_SL: [
                CallbackQueryHandler(buy_set_sl, pattern=r"^sl_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, buy_set_sl),
            ],
            BUY_SET_TP: [
                CallbackQueryHandler(buy_set_tp, pattern=r"^tp_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, buy_set_tp),
            ],
            BUY_CONFIRM: [
                CallbackQueryHandler(buy_confirm, pattern="^confirm_buy$"),
            ],
        },
        fallbacks=[
            CallbackQueryHandler(buy_cancel, pattern="^home$"),
            CommandHandler("start", cmd_start),
        ],
        allow_reentry=True,
        per_message=False,
    )

    # ── Edit SL conversation ────────────────────────────────────────────────
    edit_sl_conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(cb_edit_sl_start, pattern=r"^edit_sl_\d+$")],
        states={
            EDIT_SL_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, cb_edit_sl_tp_value)],
        },
        fallbacks=[CallbackQueryHandler(cb_position_detail, pattern=r"^pos_\d+$")],
        allow_reentry=True,
    )

    # ── Edit TP conversation ────────────────────────────────────────────────
    edit_tp_conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(cb_edit_tp_start, pattern=r"^edit_tp_\d+$")],
        states={
            EDIT_TP_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, cb_edit_sl_tp_value)],
        },
        fallbacks=[CallbackQueryHandler(cb_position_detail, pattern=r"^pos_\d+$")],
        allow_reentry=True,
    )

    # ── Settings conversation ───────────────────────────────────────────────
    settings_conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(cb_settings, pattern="^settings$")],
        states={
            SETTINGS_SELECT: [
                CallbackQueryHandler(settings_field_selected, pattern=r"^sett_"),
            ],
            SETTINGS_ENTER_VALUE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, settings_receive_value),
            ],
        },
        fallbacks=[
            CallbackQueryHandler(cb_home, pattern="^home$"),
            CommandHandler("start", cmd_start),
        ],
        allow_reentry=True,
    )

    # ── Command handlers ────────────────────────────────────────────────────
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("link",  cmd_link))

    # ── Conversation handlers ───────────────────────────────────────────────
    app.add_handler(buy_conv)
    app.add_handler(edit_sl_conv)
    app.add_handler(edit_tp_conv)
    app.add_handler(settings_conv)

    # ── Callback query handlers ─────────────────────────────────────────────
    app.add_handler(CallbackQueryHandler(cb_home,            pattern="^home$"))
    app.add_handler(CallbackQueryHandler(cb_how_to_link,     pattern="^howtolink$"))
    app.add_handler(CallbackQueryHandler(cb_sell,            pattern="^sell$"))
    app.add_handler(CallbackQueryHandler(cb_positions,       pattern="^positions$"))
    app.add_handler(CallbackQueryHandler(cb_portfolio,       pattern="^portfolio$"))
    app.add_handler(CallbackQueryHandler(cb_position_detail, pattern=r"^pos_\d+$"))
    app.add_handler(CallbackQueryHandler(cb_close_position,  pattern=r"^close_\d+_\d+$"))
    app.add_handler(CallbackQueryHandler(cb_pnl_position,    pattern=r"^pnl_pos_\d+$"))
    app.add_handler(CallbackQueryHandler(cb_pnl_trade,       pattern=r"^pnl_trade_\d+$"))

    # ── Background job: position monitor ───────────────────────────────────
    app.job_queue.run_repeating(
        trading.monitor_positions,
        interval=TRADING.monitor_interval_seconds,
        first=10,
        name="position_monitor",
    )

    # ── Error handler ───────────────────────────────────────────────────────
    app.add_error_handler(error_handler)

    return app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def _startup(app: Application) -> None:
    """Pre-startup tasks: download fonts, verify DB connection."""
    log.info("Starting FundedFrens Trading Terminal...")
    await ensure_fonts()
    client = await db.get_client()
    # Quick health check
    try:
        await client.table("profiles").select("id").limit(1).execute()
        log.info("Database connection: OK")
    except Exception as exc:
        log.error("Database connection failed: %s", exc)
        raise


def _start_health_server() -> None:
    """
    Start a minimal HTTP server on $PORT so Render's Web Service
    health check passes. Runs in a daemon thread — dies with the process.
    """
    port = int(os.environ.get("PORT", 8080))

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")

        def log_message(self, *args) -> None:  # silence access logs
            pass

    server = HTTPServer(("0.0.0.0", port), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    log.info("Health server listening on port %d", port)


def main() -> None:
    # Bind the HTTP port before anything else so Render marks the
    # service healthy immediately.
    _start_health_server()

    app = build_application()

    # Run startup tasks synchronously before polling
    loop = asyncio.get_event_loop()
    loop.run_until_complete(_startup(app))

    log.info("Bot is running. Press Ctrl+C to stop.")
    app.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
    )


if __name__ == "__main__":
    main()
