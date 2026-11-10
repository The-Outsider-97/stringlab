"""Create deterministic Windows Tauri icon assets from simple vector-like shapes.

Replace these generated placeholders with the official SLAI logo when ready.
Requires Pillow, already installed as a ReportLab dependency.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

DEST = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((8, 8, 248, 248), radius=53, fill=(14, 30, 46, 255), outline=(76, 172, 226, 255), width=7)
    # A sampled, continuous sinusoid; decorative only, not a solver output.
    from math import pi, sin
    points = [(x, round(128 + 41 * sin((x - 28) / 200 * 3 * pi))) for x in range(28, 229)]
    draw.line(points, fill=(90, 196, 247, 255), width=12, joint="curve")
    img.save(DEST / "icon.png")
    img.save(DEST / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Generated application icons in {DEST}")


if __name__ == "__main__":
    main()