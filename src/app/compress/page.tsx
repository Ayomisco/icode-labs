"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import NextImage from "next/image";
import {
  Upload,
  Image as ImageIcon,
  Film,
  FileText,
  File as FileIcon,
  Download,
  Loader2,
  CheckCircle,
  X,
  Zap,
  AlertCircle,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { supportsWebCodecsFastPath, compressVideoWebCodecs } from "./webcodecs-video";

type FileTab = "images" | "videos" | "documents" | "pdf";
type CompressionState = "idle" | "compressing" | "done" | "error";

interface Result {
  name: string;
  originalSize: number;
  compressedSize: number;
  url: string;
  mime: string;
}

const TABS: { id: FileTab; label: string; icon: React.ElementType; accepts: string; hint: string }[] = [
  {
    id: "images",
    label: "Images",
    icon: ImageIcon,
    accepts: "image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp",
    hint: "JPEG · PNG · WebP · GIF · BMP",
  },
  {
    id: "videos",
    label: "Videos",
    icon: Film,
    accepts: "video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,video/mpeg",
    hint: "MP4 · MOV · WebM · AVI · MKV",
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileText,
    accepts:
      ".docx,.xlsx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    hint: "DOCX · XLSX · PPTX",
  },
  {
    id: "pdf",
    label: "PDF",
    icon: FileIcon,
    accepts: "application/pdf",
    hint: "PDF files",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function savingPct(orig: number, compressed: number): number {
  return Math.round(((orig - compressed) / orig) * 100);
}

// ─── Compression workers ───────────────────────────────────────────────────

async function compressImage(file: File, quality: number): Promise<Blob> {
  const options = {
    maxSizeMB: 100,
    useWebWorker: true,
    initialQuality: quality,
    fileType: quality < 0.95 ? ("image/webp" as const) : undefined,
    alwaysKeepResolution: true,
  };
  return imageCompression(file, options);
}

// Tries the hardware-accelerated WebCodecs path first (fast, MP4/H.264 only);
// falls back to FFmpeg.wasm for anything it can't handle or that throws.
async function compressVideoSmart(
  file: File,
  quality: number,
  onProgress: (pct: number) => void,
  onStatus: (msg: string) => void
): Promise<Blob> {
  if (supportsWebCodecsFastPath(file)) {
    try {
      onStatus("Compressing with hardware acceleration…");
      const blob = await compressVideoWebCodecs(file, quality, onProgress);
      onStatus("");
      return blob;
    } catch (e) {
      console.warn("WebCodecs fast path failed, falling back to FFmpeg:", e);
      onProgress(0);
    }
  }
  return compressVideo(file, quality, onProgress, onStatus);
}

async function compressVideo(
  file: File,
  quality: number,
  onProgress: (pct: number) => void,
  onStatus: (msg: string) => void
): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress(Math.round(Math.min(1, Math.max(0, progress)) * 100)));

  // Single-threaded core only — the multi-threaded "-mt" build's worker
  // protocol is version-sensitive against the @ffmpeg/ffmpeg wrapper version
  // and throws "function signature mismatch" when they drift apart. This is
  // the fallback path (WebCodecs handles the common fast case), so
  // reliability matters more here than the extra speed from threading.
  const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

  onStatus("Loading FFmpeg engine…");

  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });

  onStatus("");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const input = `in.${ext}`;
  ffmpeg.writeFile(input, await fetchFile(file));

  // CRF: 20 (near-lossless) → 34 (heavy compression)
  const crf = Math.round(20 + (1 - quality) * 14);
  // Faster presets trade a little compression efficiency for much shorter encode time
  const preset = quality >= 0.8 ? "fast" : quality >= 0.4 ? "veryfast" : "ultrafast";
  // Downscale very large/heavy-compression sources to cut encode time further
  const scaleArgs = quality < 0.6 ? ["-vf", "scale='min(1280,iw)':-2"] : [];

  await ffmpeg.exec([
    "-i", input,
    "-c:v", "libx264",
    "-crf", String(crf),
    "-preset", preset,
    ...scaleArgs,
    "-c:a", "aac",
    "-b:a", quality > 0.7 ? "192k" : "128k",
    "-movflags", "+faststart",
    "out.mp4",
  ]);

  const data = await ffmpeg.readFile("out.mp4");
  return new Blob([Uint8Array.from(data as Uint8Array)], { type: "video/mp4" });
}

async function compressDocument(file: File): Promise<Blob> {
  const { unzip, zip } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());

  return new Promise((resolve, reject) => {
    unzip(buf, (err, decompressed) => {
      if (err) return reject(new Error("Not a valid ZIP-based document"));
      zip(decompressed, { level: 9 }, (err2, compressed) => {
        if (err2) return reject(err2);
        resolve(new Blob([Uint8Array.from(compressed)], { type: file.type }));
      });
    });
  });
}

async function compressPDF(file: File, quality: number): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

  // Strip metadata to reduce size
  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");
  pdf.setKeywords([]);
  pdf.setProducer("icode Compressor");
  pdf.setCreator("icode");

  const saved = await pdf.save({ useObjectStreams: quality < 0.8 });
  return new Blob([Uint8Array.from(saved)], { type: "application/pdf" });
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function CompressPage() {
  const [tab, setTab] = useState<FileTab>("images");
  const [quality, setQuality] = useState(0.75);
  const [state, setState] = useState<CompressionState>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [ffmpegStatus, setFfmpegStatus] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const prevUrlRef = useRef<string | null>(null);

  const currentTab = TABS.find((t) => t.id === tab)!;

  function reset() {
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    prevUrlRef.current = null;
    setResult(null);
    setState("idle");
    setProgress(0);
    setError("");
    setFfmpegStatus("");
  }

  const handleFile = useCallback(
    async (file: File) => {
      reset();
      setState("compressing");
      setProgress(0);

      try {
        let blob: Blob;

        if (tab === "images") {
          setProgress(10);
          blob = await compressImage(file, quality);
          setProgress(100);
        } else if (tab === "videos") {
          blob = await compressVideoSmart(
            file,
            quality,
            (pct) => setProgress(pct),
            (msg) => setFfmpegStatus(msg)
          );
        } else if (tab === "documents") {
          setProgress(30);
          blob = await compressDocument(file);
          setProgress(100);
        } else {
          setProgress(20);
          blob = await compressPDF(file, quality);
          setProgress(100);
        }

        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;

        const ext = tab === "videos" ? "mp4" : file.name.split(".").pop() ?? "bin";
        const baseName = file.name.replace(/\.[^.]+$/, "");

        setResult({
          name: `${baseName}_compressed.${ext}`,
          originalSize: file.size,
          compressedSize: blob.size,
          url,
          mime: blob.type,
        });
        setState("done");
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Compression failed");
        setState("error");
      }
    },
    [tab, quality]
  );

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const saving = result ? savingPct(result.originalSize, result.compressedSize) : 0;

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand-wrap">
          <span className="brand-mark">
            <NextImage src="/icode-logo.svg" alt="icode" width={34} height={34} />
          </span>
          <span className="brand-text">icode</span>
        </div>
        <nav className="menu">
          <Link href="/">QR Generator</Link>
          <Link href="/compress" style={{ color: "var(--ink-900)", fontWeight: 700 }}>
            Compressor
          </Link>
          <Link href="/convert">Converter</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <div className="topbar-actions">
          <span className="forever-pill">Free · No signup</span>
          <Link href="/auth/login" className="action-btn">
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "40px 0 28px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#daf3e8",
            border: "1px solid #60c8a4",
            borderRadius: 999,
            padding: "6px 14px",
            color: "#07593f",
            fontWeight: 700,
            fontSize: "0.83rem",
            marginBottom: 16,
          }}
        >
          <Zap size={14} />
          Smart File Compressor
        </div>
        <h1
          style={{
            fontFamily: "Space Grotesk, Trebuchet MS, sans-serif",
            fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
            fontWeight: 700,
            color: "var(--ink-900)",
            lineHeight: 1.15,
            marginBottom: 10,
          }}
        >
          Compress files to the bare minimum
        </h1>
        <p style={{ color: "var(--ink-500)", fontSize: "1.05rem", maxWidth: 520, margin: "0 auto" }}>
          Images, videos, documents &amp; PDFs — reduced in size, preserved in quality. All processing happens locally in your browser.
        </p>
      </section>

      {/* Main card */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          boxShadow: "0 22px 45px rgba(13,32,74,0.09)",
          overflow: "hidden",
        }}
      >
        {/* Tab row */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--line)",
            background: "#f7faff",
          }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { reset(); setTab(t.id); }}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "14px 10px",
                  background: active ? "var(--card)" : "transparent",
                  borderBottom: active ? "2px solid var(--mint)" : "2px solid transparent",
                  color: active ? "var(--ink-900)" : "var(--ink-500)",
                  fontWeight: active ? 700 : 500,
                  fontSize: "0.93rem",
                  cursor: "pointer",
                  border: "none",
                  borderBottomWidth: 2,
                  borderBottomStyle: "solid",
                  borderBottomColor: active ? "var(--mint)" : "transparent",
                  transition: "all 160ms ease",
                }}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "28px 28px 32px" }}>
          {/* Quality slider */}
          {(tab === "images" || tab === "videos" || tab === "pdf") && (
            <div
              style={{
                background: "#f4f7ff",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--ink-700)", fontSize: "0.93rem" }}>
                  Quality level
                </span>
                <span
                  style={{
                    background: "var(--mint)",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "3px 10px",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  {quality >= 0.9
                    ? "Near-lossless"
                    : quality >= 0.7
                    ? "High quality"
                    : quality >= 0.5
                    ? "Balanced"
                    : "Maximum compression"}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--mint)", height: 4, cursor: "pointer" }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  color: "var(--ink-500)",
                  fontSize: "0.78rem",
                }}
              >
                <span>Smallest size</span>
                <span>Best quality</span>
              </div>
            </div>
          )}

          {/* Drop zone */}
          {state === "idle" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "var(--mint)" : "var(--line)"}`,
                borderRadius: 14,
                padding: "52px 28px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                cursor: "pointer",
                background: dragging ? "#e8faf3" : "#fafbff",
                transition: "all 180ms ease",
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  background: dragging ? "#c8f0de" : "#eef2fc",
                  display: "grid",
                  placeItems: "center",
                  color: dragging ? "var(--mint)" : "var(--ink-500)",
                }}
              >
                <Upload size={26} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 4, fontSize: "1.05rem" }}>
                  Drop your file here
                </p>
                <p style={{ color: "var(--ink-500)", fontSize: "0.88rem" }}>
                  or click to browse — {currentTab.hint}
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={currentTab.accepts}
                style={{ display: "none" }}
                onChange={onInputChange}
              />
            </div>
          )}

          {/* Compressing state */}
          {state === "compressing" && (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: "48px 28px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                background: "#fafbff",
              }}
            >
              <Loader2 size={38} color="var(--mint)" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 4 }}>
                  {ffmpegStatus || "Compressing…"}
                </p>
                {!ffmpegStatus && tab === "videos" && (
                  <p style={{ color: "var(--ink-500)", fontSize: "0.88rem" }}>{progress}% complete</p>
                )}
              </div>
              {!ffmpegStatus && tab === "videos" && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: 400,
                    height: 6,
                    background: "#e0e8f4",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progress}%`,
                      background: "var(--mint)",
                      borderRadius: 99,
                      transition: "width 300ms ease",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {state === "error" && (
            <div
              style={{
                border: "1px solid #f0c0c5",
                borderRadius: 14,
                padding: "32px 28px",
                background: "#fef5f6",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                textAlign: "center",
              }}
            >
              <AlertCircle size={36} color="var(--danger)" />
              <div>
                <p style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>Compression failed</p>
                <p style={{ color: "var(--ink-500)", fontSize: "0.88rem" }}>{error}</p>
              </div>
              <button
                onClick={reset}
                style={{
                  marginTop: 4,
                  padding: "10px 22px",
                  background: "var(--danger)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
          )}

          {/* Done state */}
          {state === "done" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Stats bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <StatCard label="Original size" value={formatBytes(result.originalSize)} muted />
                <div
                  style={{
                    textAlign: "center",
                    background: saving > 0 ? "#daf3e8" : "#fff3cd",
                    border: `1px solid ${saving > 0 ? "#60c8a4" : "#ffc107"}`,
                    borderRadius: 12,
                    padding: "12px 20px",
                    minWidth: 120,
                  }}
                >
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.8rem", fontWeight: 700, color: saving > 0 ? "#07593f" : "#856404", lineHeight: 1 }}>
                    {saving > 0 ? `−${saving}%` : `+${Math.abs(saving)}%`}
                  </p>
                  <p style={{ fontSize: "0.78rem", color: saving > 0 ? "#0a7a56" : "#856404", fontWeight: 600, marginTop: 2 }}>
                    {saving > 0 ? "size reduction" : "size increase*"}
                  </p>
                </div>
                <StatCard label="Compressed size" value={formatBytes(result.compressedSize)} accent />
              </div>

              {saving <= 0 && (
                <p style={{ fontSize: "0.82rem", color: "var(--ink-500)", textAlign: "center" }}>
                  * The file is already well-optimised — try lowering the quality level for a smaller output.
                </p>
              )}

              {/* Progress bar visual */}
              <div>
                <div style={{ height: 8, background: "#e0e8f4", borderRadius: 99, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, 100 - saving)}%`,
                      background: "var(--mint)",
                      borderRadius: 99,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--ink-500)", marginTop: 4 }}>
                  <span>0</span>
                  <span>{formatBytes(result.originalSize)}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 12 }}>
                <a
                  href={result.url}
                  download={result.name}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: "var(--mint)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "14px 20px",
                    fontWeight: 700,
                    fontSize: "0.97rem",
                    textDecoration: "none",
                  }}
                >
                  <Download size={18} />
                  Download compressed file
                </a>
                <button
                  onClick={reset}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "14px 18px",
                    background: "transparent",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    color: "var(--ink-700)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <X size={16} />
                  New file
                </button>
              </div>

              <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--ink-500)" }}>
                <CheckCircle size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Your file never leaves your device — all compression runs locally in your browser.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Feature pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 10,
          marginTop: 28,
          paddingBottom: 40,
        }}
      >
        {[
          "100% private — processed locally",
          "No file size limits",
          "Batch coming soon",
          "No account required",
        ].map((text) => (
          <span
            key={text}
            style={{
              background: "rgba(255,255,255,0.8)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: "0.83rem",
              color: "var(--ink-500)",
              fontWeight: 600,
            }}
          >
            {text}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? "#f0fbf6" : "#f7f9ff",
        border: `1px solid ${accent ? "#a8e6cf" : "var(--line)"}`,
        borderRadius: 12,
        padding: "14px 18px",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: "0.8rem", color: "var(--ink-500)", fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.3rem", fontWeight: 700, color: accent ? "var(--mint)" : "var(--ink-900)" }}>
        {value}
      </p>
    </div>
  );
}
