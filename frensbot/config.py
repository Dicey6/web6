"""
config.py — Environment configuration and trading constants.
All environment access is centralised here; nowhere else reads os.environ directly.
"""

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

def _require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise RuntimeError(f"Required environment variable '{key}' is not set")
    return val


# Telegram
BOT_TOKEN: str = _require("TELEGRAM_BOT_TOKEN")

# Supabase — service role gives the bot full DB access (no RLS)
SUPABASE_URL: str = _require("SUPABASE_URL")
SUPABASE_SERVICE_KEY: str = _require("SUPABASE_SERVICE_ROLE_KEY")

# Website
APP_URL: str = os.getenv("APP_URL", "https://fundedfrens.com")

# Logging
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


# ---------------------------------------------------------------------------
# Trading simulation constants
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TradingConfig:
    # Position limits
    max_open_positions: int = 3
    max_allocation_pct: float = 30.0        # max % of balance per position

    # Default risk parameters (user can override in bot_settings)
    default_buy_sol: float = 0.1
    default_sl_pct: float = 20.0            # 20% stop loss
    default_tp_pct: float = 50.0            # 50% take profit
    default_auto_sell_pct: float | None = None  # disabled

    # Monitoring
    monitor_interval_seconds: int = 30

    # Slippage tolerance for display (simulation)
    simulated_slippage_pct: float = 0.5

    # Supported Solana DEXes / launchpads
    supported_dex_ids: frozenset = field(default_factory=lambda: frozenset({
        "raydium", "orca", "meteora", "pump", "moonshot",
        "fluxbeam", "lifinity", "whirlpool",
    }))

    # DexScreener
    dexscreener_base: str = "https://api.dexscreener.com/latest/dex"

    # SOL mint address (Wrapped SOL)
    wsol_address: str = "So11111111111111111111111111111111111111112"


TRADING = TradingConfig()


# ---------------------------------------------------------------------------
# PnL card
# ---------------------------------------------------------------------------

CARD_WIDTH  = 1920
CARD_HEIGHT = 1080

# Asset paths (relative to telegram_bot/)
ASSETS_DIR     = os.path.join(os.path.dirname(__file__), "assets")
FONTS_DIR      = os.path.join(ASSETS_DIR, "fonts")
FONT_BOLD      = os.path.join(FONTS_DIR, "Geist-Bold.ttf")
FONT_SEMIBOLD  = os.path.join(FONTS_DIR, "Geist-SemiBold.ttf")
FONT_REGULAR   = os.path.join(FONTS_DIR, "Geist-Regular.ttf")
LOGO_PATH      = os.path.join(ASSETS_DIR, "logo.png")

# Brand colours
COLOUR_BG         = "#0A0A0B"
COLOUR_BG2        = "#111114"
COLOUR_SURFACE    = "#18181C"
COLOUR_BORDER     = "#2A2A30"
COLOUR_GREEN      = "#00E676"
COLOUR_GREEN_DIM  = "#00C853"
COLOUR_RED        = "#FF1744"
COLOUR_RED_DIM    = "#D50000"
COLOUR_TEXT       = "#FFFFFF"
COLOUR_MUTED      = "#8888A0"
COLOUR_ACCENT     = "#7C4DFF"       # FundedFrens purple
COLOUR_ACCENT_DIM = "#4A148C"
