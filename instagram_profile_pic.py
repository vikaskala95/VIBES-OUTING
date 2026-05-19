"""Generate Instagram-optimized profile picture for Vibes@Outing (320x320 display, 1080x1080 upload)."""
from create_logo import create_logo, BRAND_PURPLE, BRAND_PURPLE_LIGHT, BRAND_WHITE
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "public", "icons")
os.makedirs(OUT, exist_ok=True)

# Instagram profile pic (1080x1080 recommended upload size)
size = 1080
img = create_logo(size)

# Save
output_path = os.path.join(OUT, "instagram_profile_pic.png")
img.save(output_path, "PNG")
print(f"✅ Instagram profile picture saved: {output_path}")
print(f"   Size: {size}x{size}px (optimized for Instagram)")
