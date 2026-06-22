#!/usr/bin/env bash
# Builds icode Compressor.app — a standalone double-clickable macOS app.
# Bundles a real ffmpeg binary (via the imageio-ffmpeg pip package) so the
# end user never needs Homebrew, a terminal, or Python installed separately.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Locating ffmpeg binary to bundle…"
FFMPEG_SRC=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
echo "    found: $FFMPEG_SRC"

mkdir -p vendor
cp "$FFMPEG_SRC" vendor/ffmpeg-bin
chmod +x vendor/ffmpeg-bin

echo "==> Running PyInstaller…"
rm -rf build dist
pyinstaller \
  --name "icode Compressor" \
  --windowed \
  --onefile \
  --add-binary "vendor/ffmpeg-bin:." \
  --hidden-import tkinterdnd2 \
  --collect-all tkinterdnd2 \
  --noconfirm \
  icode_compressor_app.py

echo ""
echo "==> Done. App is at: desktop/dist/icode Compressor.app"
echo "    Run it with: open 'dist/icode Compressor.app'"
