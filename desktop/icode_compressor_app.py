#!/usr/bin/env python3
"""
icode Compressor — desktop app for fast, native video compression.

Wraps a real ffmpeg binary (with hardware-acceleration auto-detection) in a
drag-and-drop GUI. Self-contained: all compression logic lives in this file
so PyInstaller can bundle it into a single double-clickable .app.
"""

import os
import queue
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    HAS_DND = True
except ImportError:
    HAS_DND = False

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

PRESETS = {
    "Best quality": 22,
    "Balanced (recommended)": 28,
    "Smallest size": 34,
}

# ─── Compression engine (mirrors scripts/compress_video.py) ────────────────


def find_ffmpeg() -> str | None:
    # 1. Bundled binary when packaged as a standalone .app (PyInstaller)
    if getattr(sys, "frozen", False):
        bundled = Path(getattr(sys, "_MEIPASS", "")) / "ffmpeg-bin"
        if bundled.exists():
            bundled.chmod(0o755)
            return str(bundled)

    # 2. System ffmpeg on PATH
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path

    # 3. Running from source — fall back to the imageio-ffmpeg pip package
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def detect_hw_encoder(ffmpeg: str) -> str | None:
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True, text=True, check=True,
        )
    except Exception:
        return None
    for name in ("h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_vaapi"):
        if name in result.stdout:
            return name
    return None


def probe_video(ffmpeg: str, input_path: Path) -> tuple[int, int, float, int | None, bool, float]:
    """Returns (width, height, fps, source_bitrate_bps, has_audio, duration_seconds)."""
    try:
        result = subprocess.run([ffmpeg, "-i", str(input_path)], capture_output=True, text=True)
        stderr = result.stderr
    except Exception:
        stderr = ""

    res_match = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", stderr)
    fps_match = re.search(r"([\d.]+)\s+fps", stderr)
    bitrate_match = re.search(r"bitrate:\s*(\d+)\s*kb/s", stderr)
    duration_match = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", stderr)
    has_audio = bool(re.search(r"Stream #\d+:\d+.*?: Audio:", stderr))

    width, height = (int(res_match.group(1)), int(res_match.group(2))) if res_match else (1280, 720)
    fps = float(fps_match.group(1)) if fps_match else 30.0
    source_bitrate = int(bitrate_match.group(1)) * 1000 if bitrate_match else None
    duration = 0.0
    if duration_match:
        h, m, s = duration_match.groups()
        duration = int(h) * 3600 + int(m) * 60 + float(s)
    return width, height, min(fps, 60.0), source_bitrate, has_audio, duration


def bitrate_for_quality(quality: int, width: int, height: int, fps: float, source_bitrate: int | None) -> int:
    q = max(18, min(40, quality))
    bpp = 0.12 - (q - 18) / (40 - 18) * (0.12 - 0.03)
    target = max(300_000, round(width * height * fps * bpp))
    if source_bitrate:
        target = min(target, round(source_bitrate * 0.85))
    return max(150_000, target)


def build_command(ffmpeg: str, input_path: Path, output_path: Path, quality: int, hw_encoder: str | None):
    width, height, fps, source_bitrate, has_audio, duration = probe_video(ffmpeg, input_path)
    cmd = [ffmpeg, "-y", "-i", str(input_path)]

    if hw_encoder == "h264_videotoolbox":
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
    return cmd, duration


def human_size(num_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if num_bytes < 1024:
            return f"{num_bytes:.1f}{unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f}TB"


TIME_RE = re.compile(r"time=(\d+):(\d+):([\d.]+)")


def run_ffmpeg_with_progress(cmd: list[str], duration: float, on_progress):
    process = subprocess.Popen(
        cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, bufsize=1,
    )
    for line in process.stderr:
        if duration > 0:
            match = TIME_RE.search(line)
            if match:
                h, m, s = match.groups()
                elapsed = int(h) * 3600 + int(m) * 60 + float(s)
                on_progress(min(100, round(elapsed / duration * 100)))
    process.wait()
    if process.returncode != 0:
        raise RuntimeError(f"ffmpeg exited with code {process.returncode}")


def compress_one(ffmpeg: str, input_path: Path, output_path: Path, quality: int, hw_encoder: str | None, on_progress) -> tuple[int, int]:
    cmd, duration = build_command(ffmpeg, input_path, output_path, quality, hw_encoder)
    run_ffmpeg_with_progress(cmd, duration, on_progress)

    orig_size = input_path.stat().st_size
    new_size = output_path.stat().st_size

    if hw_encoder and new_size >= orig_size:
        on_progress(0)
        cmd, duration = build_command(ffmpeg, input_path, output_path, quality, None)
        run_ffmpeg_with_progress(cmd, duration, on_progress)
        new_size = output_path.stat().st_size

    return orig_size, new_size


# ─── GUI ─────────────────────────────────────────────────────────────────


class CompressorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("icode Compressor")
        self.root.geometry("560x520")
        self.root.minsize(480, 420)

        self.ffmpeg = find_ffmpeg()
        self.hw_encoder = detect_hw_encoder(self.ffmpeg) if self.ffmpeg else None

        self.queue_files: list[Path] = []
        self.quality_var = tk.StringVar(value="Balanced (recommended)")
        self.progress_queue: queue.Queue = queue.Queue()
        self.is_running = False

        self._build_ui()
        self._poll_queue()

    def _build_ui(self):
        pad = {"padx": 16, "pady": 8}

        header = tk.Frame(self.root)
        header.pack(fill="x", **pad)
        tk.Label(header, text="icode Compressor", font=("Helvetica", 18, "bold")).pack(anchor="w")
        engine_text = f"Engine: {self.hw_encoder or 'software (libx264)'}" if self.ffmpeg else "ffmpeg not found"
        tk.Label(header, text=engine_text, fg="#666").pack(anchor="w")

        # Drop zone / file list
        drop_frame = tk.Frame(self.root, bg="#f0f4ff", highlightbackground="#c8d4ec", highlightthickness=1)
        drop_frame.pack(fill="both", expand=True, **pad)

        self.file_list = tk.Listbox(drop_frame, bg="#f0f4ff", borderwidth=0, highlightthickness=0, font=("Helvetica", 11))
        self.file_list.pack(fill="both", expand=True, padx=8, pady=8)

        if HAS_DND:
            self.file_list.drop_target_register(DND_FILES)
            self.file_list.dnd_bind("<<Drop>>", self._on_drop)
            placeholder = "Drag video files here, or click 'Add Files' below"
        else:
            placeholder = "Click 'Add Files' below to choose videos"
        self.file_list.insert(0, placeholder)
        self.file_list.itemconfig(0, fg="#999")

        # Buttons row
        btn_row = tk.Frame(self.root)
        btn_row.pack(fill="x", **pad)
        tk.Button(btn_row, text="Add Files…", command=self._add_files).pack(side="left")
        tk.Button(btn_row, text="Clear", command=self._clear_files).pack(side="left", padx=(8, 0))

        # Quality presets
        quality_frame = tk.Frame(self.root)
        quality_frame.pack(fill="x", **pad)
        tk.Label(quality_frame, text="Quality:").pack(side="left")
        for label in PRESETS:
            tk.Radiobutton(quality_frame, text=label, variable=self.quality_var, value=label).pack(side="left", padx=4)

        # Progress
        self.progress_bar = ttk.Progressbar(self.root, mode="determinate", maximum=100)
        self.progress_bar.pack(fill="x", **pad)
        self.status_label = tk.Label(self.root, text="Ready.", fg="#444")
        self.status_label.pack(anchor="w", padx=16)

        # Compress button
        self.compress_btn = tk.Button(
            self.root, text="Compress", font=("Helvetica", 13, "bold"),
            bg="#0ea57a", fg="white", command=self._start_compression,
        )
        self.compress_btn.pack(fill="x", padx=16, pady=12)

    def _on_drop(self, event):
        paths = self.root.tk.splitlist(event.data)
        for p in paths:
            path = Path(p)
            if path.suffix.lower() in VIDEO_EXTENSIONS:
                self._add_file(path)

    def _add_files(self):
        paths = filedialog.askopenfilenames(
            title="Choose videos",
            filetypes=[("Video files", " ".join(f"*{ext}" for ext in VIDEO_EXTENSIONS))],
        )
        for p in paths:
            self._add_file(Path(p))

    def _add_file(self, path: Path):
        if path in self.queue_files:
            return
        if not self.queue_files:
            self.file_list.delete(0)  # remove placeholder
        self.queue_files.append(path)
        self.file_list.insert("end", path.name)

    def _clear_files(self):
        self.queue_files.clear()
        self.file_list.delete(0, "end")
        self.file_list.insert(0, "Drag video files here, or click 'Add Files' below" if HAS_DND else "Click 'Add Files' below to choose videos")
        self.file_list.itemconfig(0, fg="#999")

    def _start_compression(self):
        if self.is_running:
            return
        if not self.ffmpeg:
            messagebox.showerror("icode Compressor", "ffmpeg was not found. Reinstall the app or run:\n\npip install imageio-ffmpeg")
            return
        if not self.queue_files:
            messagebox.showinfo("icode Compressor", "Add at least one video first.")
            return

        self.is_running = True
        self.compress_btn.config(state="disabled", text="Compressing…")
        quality = PRESETS[self.quality_var.get()]
        files = list(self.queue_files)
        thread = threading.Thread(target=self._run_batch, args=(files, quality), daemon=True)
        thread.start()

    def _run_batch(self, files: list[Path], quality: int):
        results = []
        for i, path in enumerate(files):
            self.progress_queue.put(("status", f"Compressing {path.name} ({i + 1}/{len(files)})…"))
            output_path = path.with_name(f"{path.stem}_compressed.mp4")
            try:
                orig, new = compress_one(
                    self.ffmpeg, path, output_path, quality, self.hw_encoder,
                    on_progress=lambda pct: self.progress_queue.put(("progress", pct)),
                )
                results.append((path.name, orig, new, None))
            except Exception as e:
                results.append((path.name, 0, 0, str(e)))
        self.progress_queue.put(("done", results))

    def _poll_queue(self):
        try:
            while True:
                kind, payload = self.progress_queue.get_nowait()
                if kind == "status":
                    self.status_label.config(text=payload)
                elif kind == "progress":
                    self.progress_bar["value"] = payload
                elif kind == "done":
                    self._on_batch_done(payload)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_queue)

    def _on_batch_done(self, results):
        self.is_running = False
        self.compress_btn.config(state="normal", text="Compress")
        self.progress_bar["value"] = 0

        lines = []
        any_output_dir = None
        for name, orig, new, error in results:
            if error:
                lines.append(f"{name}: failed ({error})")
            else:
                saved = (1 - new / orig) * 100 if orig else 0
                lines.append(f"{name}: {human_size(orig)} -> {human_size(new)} ({saved:.0f}% smaller)")
                any_output_dir = any_output_dir or self.queue_files[0].parent

        self.status_label.config(text="Done.")
        message = "\n".join(lines)
        if any_output_dir and messagebox.askyesno("icode Compressor", f"{message}\n\nOpen the output folder?"):
            self._reveal_folder(any_output_dir)

    def _reveal_folder(self, folder: Path):
        if sys.platform == "darwin":
            subprocess.run(["open", str(folder)])
        elif sys.platform == "win32":
            os.startfile(folder)  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", str(folder)])


def main():
    root = TkinterDnD.Tk() if HAS_DND else tk.Tk()
    CompressorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
