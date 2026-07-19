"""
pnl.py — Premium PnL card generator (1920×1080 landscape).

Cards are generated with Pillow. No template images are required —
everything is drawn programmatically. Fonts are downloaded on first use
and cached in assets/fonts/.
"""

import io
import logging
import os
from dataclasses import dataclass
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from config import (
    ASSETS_DIR, CARD_HEIGHT, CARD_WIDTH, COLOUR_ACCENT, COLOUR_BG,
    COLOUR_BG2, COLOUR_BORDER, COLOUR_GREEN, COLOUR_GREEN_DIM,
    COLOUR_MUTED, COLOUR_RED, COLOUR_RED_DIM, COLOUR_SURFACE,
    COLOUR_TEXT, FONTS_DIR, FONT_BOLD, FONT_REGULAR, FONT_SEMIBOLD,
    LOGO_PATH,
)

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Font management
# ---------------------------------------------------------------------------

_JBMONO_BOLD_URL = (
    "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/"
    "JetBrainsMono-Bold.ttf"
)
_JBMONO_REGULAR_URL = (
    "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/"
    "JetBrainsMono-Regular.ttf"
)

# Fallback system fonts (always present on Linux/Render)
_SYSTEM_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]

_font_cache: dict[tuple, ImageFont.FreeTypeFont] = {}


def _ensure_fonts_dir() -> None:
    Path(FONTS_DIR).mkdir(parents=True, exist_ok=True)


async def _download_font(url: str, dest: str) -> bool:
    """Download a font file to disk. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            Path(dest).write_bytes(resp.content)
        log.info("Downloaded font → %s", dest)
        return True
    except Exception as exc:
        log.warning("Font download failed (%s): %s", url, exc)
        return False


async def ensure_fonts() -> None:
    """Download JetBrains Mono fonts to assets/fonts/ if not already present."""
    _ensure_fonts_dir()

    # We use JetBrains Mono for number displays (premium feel)
    # and system font fallback for general text.
    # fonts/ dir is inside assets/ which is sibling to the bot files.
    jb_bold = os.path.join(FONTS_DIR, "JBMono-Bold.ttf")
    jb_reg  = os.path.join(FONTS_DIR, "JBMono-Regular.ttf")

    if not os.path.exists(jb_bold):
        await _download_font(_JBMONO_BOLD_URL, jb_bold)
    if not os.path.exists(jb_reg):
        await _download_font(_JBMONO_REGULAR_URL, jb_reg)


def _load_font(path_preference: list[str], size: int) -> ImageFont.FreeTypeFont:
    """
    Load a font from a list of preferred paths.
    Falls back to PIL's built-in if nothing is found.
    """
    cache_key = (tuple(path_preference), size)
    if cache_key in _font_cache:
        return _font_cache[cache_key]

    # JetBrains Mono cached in assets/fonts
    jb_bold = os.path.join(FONTS_DIR, "JBMono-Bold.ttf")
    jb_reg  = os.path.join(FONTS_DIR, "JBMono-Regular.ttf")

    for path in path_preference:
        # Resolve aliases
        resolved = (
            jb_bold if path == FONT_BOLD else
            jb_reg  if path in (FONT_SEMIBOLD, FONT_REGULAR) else
            path
        )
        if os.path.exists(resolved):
            try:
                font = ImageFont.truetype(resolved, size)
                _font_cache[cache_key] = font
                return font
            except Exception:
                pass

    # System fonts
    for sys_path in _SYSTEM_FONTS:
        if os.path.exists(sys_path):
            try:
                font = ImageFont.truetype(sys_path, size)
                _font_cache[cache_key] = font
                return font
            except Exception:
                pass

    # Absolute last resort
    font = ImageFont.load_default(size=size)
    _font_cache[cache_key] = font
    return font


# ---------------------------------------------------------------------------
# Card data
# ---------------------------------------------------------------------------

@dataclass
class PnLCardData:
    card_type: str           # "live" | "closed"
    username: str
    token_symbol: str
    token_name: str
    entry_market_cap_usd: float
    current_market_cap_usd: float
    invested_sol: float
    current_value_sol: float
    profit_pct: float
    profit_sol: float
    hold_time: str
    token_logo_url: str | None = None


# ---------------------------------------------------------------------------
# Card rendering
# ---------------------------------------------------------------------------

def _hex(colour: str) -> tuple:
    """Convert '#RRGGBB' to (R, G, B)."""
    c = colour.lstrip("#")
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))


def _hex_alpha(colour: str, alpha: int) -> tuple:
    return (*_hex(colour), alpha)


def _draw_rounded_rect(
    draw: ImageDraw.ImageDraw,
    xy: tuple,
    radius: int,
    fill: tuple,
    outline: tuple | None = None,
    outline_width: int = 1,
) -> None:
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill,
                           outline=outline, width=outline_width)


def _draw_glow(img: Image.Image, centre: tuple, radius: int, colour: tuple, alpha: int = 60) -> None:
    """Draw a soft radial glow behind the hero profit text."""
    glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)

    for r in range(radius, 0, -radius // 8):
        a = int(alpha * (1 - r / radius) ** 2)
        cx, cy = centre
        gd.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            fill=(*colour, a),
        )

    glow_blurred = glow_layer.filter(ImageFilter.GaussianBlur(radius // 3))
    img.paste(glow_blurred, (0, 0), glow_blurred)


async def _fetch_token_logo(url: str) -> Image.Image | None:
    """Download and return a token logo, or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert("RGBA")
    except Exception as exc:
        log.debug("Failed to fetch token logo: %s", exc)
        return None


async def generate_pnl_card(data: PnLCardData) -> bytes:
    """
    Render a 1920×1080 PnL card and return PNG bytes.

    The card is suitable for sharing on X / Telegram.
    Colours: green palette for profit, red for loss.
    """
    is_profit = data.profit_sol >= 0
    accent_hex = COLOUR_GREEN if is_profit else COLOUR_RED
    accent_dim  = COLOUR_GREEN_DIM if is_profit else COLOUR_RED_DIM
    accent_rgb  = _hex(accent_hex)
    bg_rgb      = _hex(COLOUR_BG)
    bg2_rgb     = _hex(COLOUR_BG2)
    surf_rgb    = _hex(COLOUR_SURFACE)
    border_rgb  = _hex(COLOUR_BORDER)
    text_rgb    = _hex(COLOUR_TEXT)
    muted_rgb   = _hex(COLOUR_MUTED)
    purple_rgb  = _hex(COLOUR_ACCENT)

    W, H = CARD_WIDTH, CARD_HEIGHT

    # ── Base image (RGBA for compositing) ──────────────────────────────────
    img = Image.new("RGBA", (W, H), (*bg_rgb, 255))
    draw = ImageDraw.Draw(img)

    # Subtle vertical gradient overlay
    for y in range(H):
        blend = int(18 * (1 - y / H))
        draw.line([(0, y), (W, y)], fill=(*bg2_rgb, blend))

    # Corner accent lines
    line_col = (*accent_rgb, 30)
    draw.line([(0, 0), (W, 0)], fill=line_col, width=2)
    draw.line([(0, H - 1), (W, H - 1)], fill=line_col, width=2)

    # ── Fonts ───────────────────────────────────────────────────────────────
    f_hero       = _load_font([FONT_BOLD], 180)
    f_symbol     = _load_font([FONT_BOLD], 72)
    f_name       = _load_font([FONT_SEMIBOLD], 36)
    f_label      = _load_font([FONT_REGULAR], 28)
    f_value      = _load_font([FONT_BOLD], 44)
    f_brand      = _load_font([FONT_SEMIBOLD], 32)
    f_badge      = _load_font([FONT_BOLD], 24)
    f_username   = _load_font([FONT_SEMIBOLD], 36)

    # ── Glow behind hero text ───────────────────────────────────────────────
    _draw_glow(img, (W // 2, 360), 420, accent_rgb, alpha=45)
    draw = ImageDraw.Draw(img)  # redraw after paste

    # ── Top bar ─────────────────────────────────────────────────────────────
    # FundedFrens logo (left)
    logo_y = 48
    draw.text((60, logo_y), "FundedFrens", font=f_brand, fill=(*text_rgb, 255))

    # Horizontal rule under top bar
    bar_y = 110
    draw.line([(60, bar_y), (W - 60, bar_y)], fill=(*border_rgb, 180), width=1)

    # LIVE / CLOSED badge (right)
    badge_text  = "● LIVE TRADE" if data.card_type == "live" else "● CLOSED TRADE"
    badge_fill  = _hex_alpha(accent_hex, 25)
    badge_col   = (*accent_rgb, 255)
    badge_w, badge_h = 240, 44
    badge_x = W - 60 - badge_w
    badge_y = logo_y - 4
    _draw_rounded_rect(draw, (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
                       radius=8, fill=badge_fill, outline=(*accent_rgb, 80), outline_width=1)
    draw.text((badge_x + badge_w // 2, badge_y + badge_h // 2),
              badge_text, font=f_badge, fill=badge_col, anchor="mm")

    # ── Token identity ──────────────────────────────────────────────────────
    tok_x = 60
    tok_y = 145

    # Optionally draw token logo
    logo_img = None
    if data.token_logo_url:
        logo_img = await _fetch_token_logo(data.token_logo_url)

    if logo_img:
        logo_size = 80
        logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
        # Circular mask
        mask = Image.new("L", (logo_size, logo_size), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse((0, 0, logo_size, logo_size), fill=255)
        img.paste(logo_img, (tok_x, tok_y), mask)
        sym_x = tok_x + logo_size + 20
    else:
        sym_x = tok_x

    draw = ImageDraw.Draw(img)
    draw.text((sym_x, tok_y), data.token_symbol, font=f_symbol, fill=(*text_rgb, 255))
    draw.text((sym_x, tok_y + 82), data.token_name, font=f_name, fill=(*muted_rgb, 200))

    # ── Hero: profit percentage ─────────────────────────────────────────────
    sign = "+" if is_profit else ""
    hero_text = f"{sign}{data.profit_pct:.1f}%"

    # Shadow / blur for depth
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.text((W // 2, 380), hero_text, font=f_hero, fill=(*accent_rgb, 100), anchor="mm")
    blurred = shadow_layer.filter(ImageFilter.GaussianBlur(12))
    img = Image.alpha_composite(img, blurred)
    draw = ImageDraw.Draw(img)

    # Main hero text
    draw.text((W // 2, 370), hero_text, font=f_hero, fill=(*accent_rgb, 255), anchor="mm")

    # ── Stats grid ──────────────────────────────────────────────────────────
    # 4 cards in one row, evenly spaced
    grid_y     = 560
    card_h     = 160
    padding    = 40
    gap        = 24
    n_cards    = 4
    card_w     = (W - padding * 2 - gap * (n_cards - 1)) // n_cards

    stats = [
        ("Entry Market Cap",  _fmt_usd(data.entry_market_cap_usd)),
        (("Current MC" if data.card_type == "live" else "Exit Market Cap"),
                              _fmt_usd(data.current_market_cap_usd)),
        ("Invested",          f"{data.invested_sol:.4f} SOL"),
        (("Current Value" if data.card_type == "live" else "Exit Value"),
                              f"{data.current_value_sol:.4f} SOL"),
    ]

    for i, (label, value) in enumerate(stats):
        cx = padding + i * (card_w + gap)
        cy = grid_y
        # Card background
        _draw_rounded_rect(
            draw,
            (cx, cy, cx + card_w, cy + card_h),
            radius=12,
            fill=(*surf_rgb, 255),
            outline=(*border_rgb, 120),
            outline_width=1,
        )
        # Accent top strip
        draw.rounded_rectangle(
            (cx, cy, cx + card_w, cy + 3),
            radius=12,
            fill=(*accent_rgb, 80),
        )
        # Label
        draw.text(
            (cx + card_w // 2, cy + 40),
            label, font=f_label, fill=(*muted_rgb, 200), anchor="mm",
        )
        # Value
        draw.text(
            (cx + card_w // 2, cy + 105),
            value, font=f_value, fill=(*text_rgb, 255), anchor="mm",
        )

    # ── Bottom stats row ────────────────────────────────────────────────────
    bot_y = grid_y + card_h + 36
    bottom_stats = [
        ("Profit (SOL)", f"{sign}{data.profit_sol:.4f} SOL", accent_hex),
        ("Hold Time",    data.hold_time,                      COLOUR_TEXT),
    ]
    bcard_w = (W - padding * 2 - gap) // 2

    for i, (label, value, colour) in enumerate(bottom_stats):
        cx = padding + i * (bcard_w + gap)
        cy = bot_y
        _draw_rounded_rect(
            draw,
            (cx, cy, cx + bcard_w, cy + 120),
            radius=12,
            fill=(*surf_rgb, 255),
            outline=(*border_rgb, 120),
            outline_width=1,
        )
        v_col = _hex(colour)
        draw.text((cx + bcard_w // 2, cy + 35), label,
                  font=f_label, fill=(*muted_rgb, 200), anchor="mm")
        draw.text((cx + bcard_w // 2, cy + 85), value,
                  font=f_value, fill=(*v_col, 255), anchor="mm")

    # ── Bottom bar ──────────────────────────────────────────────────────────
    foot_y = H - 80
    draw.line([(60, foot_y), (W - 60, foot_y)], fill=(*border_rgb, 120), width=1)

    # Username (left)
    draw.text((60, foot_y + 20), f"@{data.username}",
              font=f_username, fill=(*muted_rgb, 200))

    # Branding (right)
    brand_text = "fundedfrens.com  •  Prop Trading"
    draw.text((W - 60, foot_y + 20), brand_text,
              font=f_brand, fill=(*_hex(COLOUR_ACCENT), 180), anchor="ra")

    # ── Export ──────────────────────────────────────────────────────────────
    # Convert to RGB for JPEG (no alpha) → smaller, faster to send
    out = img.convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_usd(value: float) -> str:
    if value >= 1_000_000_000:
        return f"${value/1_000_000_000:.2f}B"
    if value >= 1_000_000:
        return f"${value/1_000_000:.2f}M"
    if value >= 1_000:
        return f"${value/1_000:.1f}K"
    return f"${value:.2f}"
