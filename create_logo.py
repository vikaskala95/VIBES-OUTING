"""Generate a VIBES@Outing logo PNG matching the project's brand identity."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "presentations")
os.makedirs(OUT, exist_ok=True)

# Brand colors from the project (CSS variables)
BRAND_PURPLE = (108, 60, 225)       # --primary #6C3CE1
BRAND_PURPLE_LIGHT = (142, 100, 255) # --primary-light
BRAND_DARK = (30, 27, 46)           # #1E1B2E
BRAND_WHITE = (255, 255, 255)

def create_logo(size=200, text_logo=False):
    """Create a circular compass-style logo."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Gradient circle background (simulate with concentric circles)
    cx, cy = size // 2, size // 2
    r = size // 2 - 2
    for i in range(r, 0, -1):
        ratio = i / r
        color = (
            int(BRAND_PURPLE[0] * ratio + BRAND_PURPLE_LIGHT[0] * (1 - ratio)),
            int(BRAND_PURPLE[1] * ratio + BRAND_PURPLE_LIGHT[1] * (1 - ratio)),
            int(BRAND_PURPLE[2] * ratio + BRAND_PURPLE_LIGHT[2] * (1 - ratio)),
            255
        )
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=color)
    
    # Draw compass-like symbol
    # Outer ring
    ring_w = max(3, size // 25)
    draw.ellipse([cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5], outline=BRAND_WHITE + (200,), width=ring_w)
    
    # Inner compass diamond/arrow pointing up
    inner_r = int(r * 0.55)
    # North arrow (white)
    draw.polygon([
        (cx, cy - inner_r),           # top
        (cx - inner_r // 3, cy),      # left mid
        (cx, cy + inner_r // 6),      # center low
        (cx + inner_r // 3, cy),      # right mid
    ], fill=BRAND_WHITE + (240,))
    
    # South arrow (lighter)
    draw.polygon([
        (cx, cy + inner_r),           # bottom
        (cx - inner_r // 3, cy),      # left mid
        (cx, cy - inner_r // 6),      # center high
        (cx + inner_r // 3, cy),      # right mid
    ], fill=BRAND_WHITE + (120,))
    
    # Center dot
    dot_r = max(4, size // 20)
    draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=BRAND_WHITE)
    
    # Cardinal direction dots
    dot_small = max(2, size // 40)
    offsets = [(0, -r + 15), (0, r - 15), (-r + 15, 0), (r - 15, 0)]
    for dx, dy in offsets:
        draw.ellipse([cx + dx - dot_small, cy + dy - dot_small, cx + dx + dot_small, cy + dy + dot_small], fill=BRAND_WHITE + (180,))
    
    return img


def create_wide_logo(height=80):
    """Create a wide logo with icon + text for header usage."""
    icon_size = height
    icon = create_logo(icon_size)
    
    # Create text portion
    text_width = int(height * 4.5)
    total_width = icon_size + 10 + text_width
    img = Image.new("RGBA", (total_width, height), (0, 0, 0, 0))
    
    # Paste icon
    img.paste(icon, (0, 0), icon)
    
    draw = ImageDraw.Draw(img)
    
    # Main text
    try:
        font_main = ImageFont.truetype("arialbd.ttf", int(height * 0.38))
        font_sub = ImageFont.truetype("arial.ttf", int(height * 0.16))
    except (OSError, IOError):
        try:
            font_main = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", int(height * 0.38))
            font_sub = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", int(height * 0.16))
        except (OSError, IOError):
            font_main = ImageFont.load_default()
            font_sub = ImageFont.load_default()
    
    text_x = icon_size + 10
    draw.text((text_x, int(height * 0.12)), "VIBES@Outing", fill=BRAND_PURPLE, font=font_main)
    draw.text((text_x, int(height * 0.58)), "Discover. Connect. Explore Together.", fill=(120, 120, 140), font=font_sub)
    
    return img


if __name__ == "__main__":
    # Square logo (for title slides)
    logo = create_logo(300)
    logo.save(os.path.join(OUT, "logo_square.png"))
    print("✅ logo_square.png created (300x300)")
    
    # Wide logo (for slide headers)
    wide = create_wide_logo(100)
    wide.save(os.path.join(OUT, "logo_wide.png"))
    print("✅ logo_wide.png created (wide header)")
    
    # Small square (for footer/small placements)
    small = create_logo(80)
    small.save(os.path.join(OUT, "logo_small.png"))
    print("✅ logo_small.png created (80x80)")
