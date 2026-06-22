# icode Compressor (desktop app)

A standalone macOS app for fast, native video compression — no browser, no
WASM, no Homebrew required. Wraps a real ffmpeg binary with automatic
hardware-acceleration detection (VideoToolbox on macOS, NVENC/QSV/VAAPI
elsewhere) in a drag-and-drop window.

## Run from source

```bash
pip install imageio-ffmpeg tkinterdnd2
python3 icode_compressor_app.py
```

## Build the standalone .app

```bash
pip install pyinstaller imageio-ffmpeg tkinterdnd2
./build_app.sh
open "dist/icode Compressor.app"
```

The build script copies the ffmpeg binary bundled by `imageio-ffmpeg` into
`vendor/ffmpeg-bin` and embeds it in the app via PyInstaller, so the
resulting `.app` works standalone on a machine with no Python or ffmpeg
installed at all.

## How it picks an encoder

1. A bundled ffmpeg binary (when running as a packaged `.app`)
2. A system `ffmpeg` on `PATH`, if present
3. The `imageio-ffmpeg` pip package's binary (when running from source)

It then probes for a hardware H.264 encoder (VideoToolbox / NVENC / QSV /
VAAPI) and falls back to software libx264 if none is available. If hardware
encoding ever fails to actually shrink the file (a real VideoToolbox
limitation at very low bitrates), it automatically retries once with
software encoding.

## Known limitation

PyInstaller currently warns that onefile + windowed mode "doesn't make
sense" for macOS `.app` bundles and will become a hard error in PyInstaller
v7. It still works correctly today (tested end-to-end). If a future
PyInstaller upgrade breaks the build, switch `build_app.sh` from
`--onefile` to `--onedir`.
