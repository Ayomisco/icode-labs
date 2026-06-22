#!/usr/bin/env python3
"""
Fast video compressor — wraps the ffmpeg binary directly and uses hardware
acceleration (VideoToolbox on macOS, NVENC on NVIDIA, QSV on Intel, VAAPI on
Linux) when available. Falls back to software libx264 with a fast preset
otherwise.

Usage:
    python3 compress_video.py input.mp4
    python3 compress_video.py input.mp4 -o output.mp4 -q 30
    python3 compress_video.py ./videos --batch
    python3 compress_video.py ./videos --batch -q 32

Quality (-q): lower = better quality / larger file. 18-23 near-lossless,
24-28 good default, 30-35 noticeably smaller, 36+ heavy compression.
"""

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def find_ffmpeg() -> str | None:
    """Prefer a system ffmpeg on PATH; fall back to the bundled binary from
    the `imageio-ffmpeg` pip package (no Homebrew/system install needed)."""
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def detect_hw_encoder(ffmpeg: str) -> str | None:
    """Return a hardware-accelerated H.264 encoder name ffmpeg supports, else None."""
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True, text=True, check=True,
        )
    except Exception:
        return None

    encoders = result.stdout
    for name in ("h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_vaapi"):
        if name in encoders:
            return name
    return None


def probe_video(ffmpeg: str, input_path: Path) -> tuple[int, int, float, int | None, bool]:
    """Returns (width, height, fps, source_bitrate_bps, has_audio). Defaults
    width/height/fps if parsing fails; source_bitrate is None if undetermined."""
    try:
        result = subprocess.run([ffmpeg, "-i", str(input_path)], capture_output=True, text=True)
        stderr = result.stderr
    except Exception:
        stderr = ""

    res_match = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", stderr)
    fps_match = re.search(r"([\d.]+)\s+fps", stderr)
    bitrate_match = re.search(r"bitrate:\s*(\d+)\s*kb/s", stderr)
    has_audio = bool(re.search(r"Stream #\d+:\d+.*?: Audio:", stderr))

    width, height = (int(res_match.group(1)), int(res_match.group(2))) if res_match else (1280, 720)
    fps = float(fps_match.group(1)) if fps_match else 30.0
    source_bitrate = int(bitrate_match.group(1)) * 1000 if bitrate_match else None
    return width, height, min(fps, 60.0), source_bitrate, has_audio


def bitrate_for_quality(quality: int, width: int, height: int, fps: float, source_bitrate: int | None) -> int:
    """Maps a CRF-like quality (18 best .. 40 worst) to a target bitrate for
    encoders that don't support constant-quality mode (e.g. some VideoToolbox
    builds). Never targets above the source's own bitrate, so output never
    ends up larger than the input."""
    q = max(18, min(40, quality))
    bpp = 0.12 - (q - 18) / (40 - 18) * (0.12 - 0.03)  # bits per pixel per frame
    target = max(300_000, round(width * height * fps * bpp))
    if source_bitrate:
        # Leave some headroom below source bitrate so compression actually shrinks the file
        target = min(target, round(source_bitrate * 0.85))
    return max(150_000, target)


def build_command(ffmpeg: str, input_path: Path, output_path: Path, quality: int, hw_encoder: str | None) -> list[str]:
    width, height, fps, source_bitrate, has_audio = probe_video(ffmpeg, input_path)

    cmd = [ffmpeg, "-y", "-i", str(input_path)]

    if hw_encoder == "h264_videotoolbox":
        # This VideoToolbox build doesn't support constant-quality (-q:v) mode
        # on all macOS versions — target bitrate is the reliable option.
        bitrate = bitrate_for_quality(quality, width, height, fps, source_bitrate)
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", str(bitrate), "-maxrate", str(round(bitrate * 1.3)), "-bufsize", str(bitrate * 2)]
    elif hw_encoder == "h264_nvenc":
        cmd += ["-c:v", "h264_nvenc", "-preset", "p1", "-cq", str(quality)]
    elif hw_encoder == "h264_qsv":
        cmd += ["-c:v", "h264_qsv", "-global_quality", str(quality)]
    elif hw_encoder == "h264_vaapi":
        cmd += [
            "-vaapi_device", "/dev/dri/renderD128",
            "-vf", "format=nv12,hwupload",
            "-c:v", "h264_vaapi", "-qp", str(quality),
        ]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(quality)]

    cmd += ["-c:a", "aac", "-b:a", "128k"] if has_audio else ["-an"]
    cmd += ["-movflags", "+faststart", str(output_path)]
    return cmd


def human_size(num_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if num_bytes < 1024:
            return f"{num_bytes:.1f}{unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f}TB"


def compress_one(ffmpeg: str, input_path: Path, output_path: Path, quality: int, hw_encoder: str | None) -> None:
    cmd = build_command(ffmpeg, input_path, output_path, quality, hw_encoder)
    subprocess.run(cmd, check=True)

    orig_size = input_path.stat().st_size
    new_size = output_path.stat().st_size

    # Hardware encoders (especially VideoToolbox) don't always comply tightly
    # with a low target bitrate, particularly on already-low-bitrate sources.
    # If hardware encoding didn't actually shrink the file, retry once with
    # software libx264, which uses true CRF and is far more predictable.
    if hw_encoder and new_size >= orig_size:
        print("  hardware encoder didn't shrink the file — retrying with software encoder…")
        cmd = build_command(ffmpeg, input_path, output_path, quality, None)
        subprocess.run(cmd, check=True)
        new_size = output_path.stat().st_size

    saved_pct = (1 - new_size / orig_size) * 100 if orig_size else 0
    print(f"  {human_size(orig_size)} -> {human_size(new_size)}  ({saved_pct:.0f}% smaller)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fast video compressor using ffmpeg.")
    parser.add_argument("input", help="Input video file or folder")
    parser.add_argument("-o", "--output", help="Output file path (single-file mode only)")
    parser.add_argument(
        "-q", "--quality", type=int, default=28,
        help="Quality, lower = better/larger (18-23 near-lossless, 28 default, 35+ small). Default 28.",
    )
    parser.add_argument("--batch", action="store_true", help="Treat input as a folder; compress every video inside")
    parser.add_argument("--suffix", default="_compressed", help="Output filename suffix in batch mode")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("No ffmpeg available. Install one of:")
        print("  pip install imageio-ffmpeg   (easiest, no system install needed)")
        print("  brew install ffmpeg")
        print("  sudo apt install ffmpeg")
        sys.exit(1)

    hw_encoder = detect_hw_encoder(ffmpeg)
    print(f"Using {'hardware acceleration: ' + hw_encoder if hw_encoder else 'software encoding (libx264, veryfast)'}")

    input_path = Path(args.input)

    if args.batch or input_path.is_dir():
        if not input_path.is_dir():
            print(f"Error: {input_path} is not a folder.")
            sys.exit(1)

        videos = sorted(p for p in input_path.iterdir() if p.suffix.lower() in VIDEO_EXTENSIONS)
        if not videos:
            print("No video files found in that folder.")
            return

        for video in videos:
            output_path = video.with_name(f"{video.stem}{args.suffix}.mp4")
            print(f"\n-> {video.name}")
            compress_one(ffmpeg, video, output_path, args.quality, hw_encoder)
    else:
        if not input_path.is_file():
            print(f"Error: {input_path} not found.")
            sys.exit(1)

        output_path = Path(args.output) if args.output else input_path.with_name(f"{input_path.stem}_compressed.mp4")
        print(f"\n-> {input_path.name}")
        compress_one(ffmpeg, input_path, output_path, args.quality, hw_encoder)
        print(f"Saved to: {output_path}")


if __name__ == "__main__":
    main()
