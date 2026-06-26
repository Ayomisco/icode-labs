"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import NextImage from "next/image";
import {
  Upload, Image as ImageIcon, FileText, FileSpreadsheet,
  Archive, Download, Loader2, CheckCircle, X, ArrowRight,
  AlertCircle, FilePlus, Layers, Scissors, SplitSquareHorizontal,
} from "lucide-react";
import {
  convertImage, imagesToPdf, pdfToImages, pdfToText,
  mergePdfs, splitPdf, docxToPdf, docxToHtml, docxToText,
  xlsxToPdf, xlsxToCsv, csvToXlsx, xlsxToJson, jsonToCsv, csvToJson,
  filesToZip, extractZip, formatBytes,
} from "./converters";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "images" | "pdf" | "documents" | "spreadsheets" | "archives";
type ConvState = "idle" | "converting" | "done" | "error";

interface ConvResult {
  name: string;
  blob: Blob;
  url: string;
  size: number;
}

// ─── Conversion definitions ───────────────────────────────────────────────────

const IMAGE_FORMATS = ["PNG", "JPG", "WebP", "BMP", "HEIC", "SVG", "GIF"];
const IMAGE_TO = ["PNG", "JPG", "WebP", "BMP", "PDF"];

const PDF_OPS = [
  { id: "pdf-to-png",   label: "PDF → PNG Images",   icon: ImageIcon,             multi: false, hint: "Converts each page to a PNG image" },
  { id: "pdf-to-jpg",   label: "PDF → JPG Images",   icon: ImageIcon,             multi: false, hint: "Converts each page to a JPG image" },
  { id: "pdf-to-text",  label: "PDF → Text",         icon: FileText,              multi: false, hint: "Extracts all readable text from PDF" },
  { id: "images-to-pdf",label: "Images → PDF",       icon: FilePlus,              multi: true,  hint: "Combine one or more images into a PDF" },
  { id: "merge-pdf",    label: "Merge PDFs",         icon: Layers,                multi: true,  hint: "Combine multiple PDF files into one" },
  { id: "split-pdf",    label: "Split PDF",          icon: SplitSquareHorizontal, multi: false, hint: "Extract each page into its own PDF" },
] as const;
type PdfOp = typeof PDF_OPS[number]["id"];

const DOC_OPS = [
  { id: "docx-to-pdf",  label: "Word → PDF",   accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",  hint: "Preserves headings, tables, lists, and styles" },
  { id: "docx-to-html", label: "Word → HTML",  accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",  hint: "Converts to clean, browser-ready HTML" },
  { id: "docx-to-text", label: "Word → Text",  accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",  hint: "Extracts plain text content" },
] as const;
type DocOp = typeof DOC_OPS[number]["id"];

const SHEET_OPS = [
  { id: "xlsx-to-pdf",  label: "Excel → PDF",  accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hint: "Renders sheets with full layout, borders, and colors" },
  { id: "xlsx-to-csv",  label: "Excel → CSV",  accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hint: "Exports all sheet data as comma-separated values" },
  { id: "xlsx-to-json", label: "Excel → JSON", accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hint: "Converts rows to JSON objects using headers as keys" },
  { id: "csv-to-xlsx",  label: "CSV → Excel",  accept: ".csv,text/csv",                                                                hint: "Creates a proper Excel workbook from CSV" },
  { id: "csv-to-json",  label: "CSV → JSON",   accept: ".csv,text/csv",                                                                hint: "Converts CSV rows to JSON array" },
  { id: "json-to-csv",  label: "JSON → CSV",   accept: ".json,application/json",                                                       hint: "Converts flat JSON array to CSV" },
] as const;
type SheetOp = typeof SHEET_OPS[number]["id"];

const ARCHIVE_OPS = [
  { id: "files-to-zip", label: "Files → ZIP",    multi: true,  hint: "Bundle multiple files into a ZIP archive" },
  { id: "extract-zip",  label: "Extract ZIP",    multi: false, hint: "Extract and download files from a ZIP" },
] as const;
type ArchiveOp = typeof ARCHIVE_OPS[number]["id"];

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "images",       label: "Images",       icon: ImageIcon },
  { id: "pdf",          label: "PDF Tools",    icon: FileText },
  { id: "documents",    label: "Documents",    icon: FileText },
  { id: "spreadsheets", label: "Spreadsheets", icon: FileSpreadsheet },
  { id: "archives",     label: "Archives",     icon: Archive },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConvertPage() {
  const [tab, setTab] = useState<Tab>("images");

  // image tab
  const [imgFrom, setImgFrom] = useState("PNG");
  const [imgTo, setImgTo] = useState("JPG");

  // op selectors
  const [pdfOp, setPdfOp] = useState<PdfOp>("pdf-to-png");
  const [docOp, setDocOp] = useState<DocOp>("docx-to-pdf");
  const [sheetOp, setSheetOp] = useState<SheetOp>("xlsx-to-pdf");
  const [archiveOp, setArchiveOp] = useState<ArchiveOp>("files-to-zip");

  const [state, setState] = useState<ConvState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [results, setResults] = useState<ConvResult[]>([]);
  const [extractedFiles, setExtractedFiles] = useState<{ name: string; blob: Blob }[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  function reset() {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setResults([]);
    setExtractedFiles([]);
    setState("idle");
    setProgress(0);
    setError("");
    setStatusMsg("");
  }

  function switchTab(t: Tab) {
    reset();
    setTab(t);
  }

  // ─── Accept string per current op ─────────────────────────────────────────
  function acceptStr(): string {
    if (tab === "images") {
      const map: Record<string, string> = {
        PNG: "image/png", JPG: "image/jpeg", WebP: "image/webp",
        BMP: "image/bmp", HEIC: ".heic,.heif", SVG: "image/svg+xml", GIF: "image/gif",
      };
      return Object.values(map).join(",");
    }
    if (tab === "pdf") {
      const op = PDF_OPS.find((o) => o.id === pdfOp)!;
      if (pdfOp === "images-to-pdf") return "image/*,.heic,.heif";
      return "application/pdf";
    }
    if (tab === "documents") return DOC_OPS.find((o) => o.id === docOp)!.accept;
    if (tab === "spreadsheets") return SHEET_OPS.find((o) => o.id === sheetOp)!.accept;
    if (tab === "archives") {
      return archiveOp === "extract-zip" ? ".zip,application/zip" : "*";
    }
    return "*";
  }

  function isMulti(): boolean {
    if (tab === "pdf") return PDF_OPS.find((o) => o.id === pdfOp)!.multi;
    if (tab === "archives") return ARCHIVE_OPS.find((o) => o.id === archiveOp)!.multi;
    return false;
  }

  // ─── Run conversion ────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: File[]) => {
      reset();
      setState("converting");
      setProgress(0);

      try {
        let outputs: { blob: Blob; ext: string }[] = [];
        let baseName = files[0].name.replace(/\.[^.]+$/, "");

        setStatusMsg("Preparing…");

        if (tab === "images") {
          const fmt = imgTo.toLowerCase() as "png" | "jpg" | "webp" | "bmp" | "pdf";
          setStatusMsg("Converting image…");
          const out = await convertImage(files[0], fmt);
          outputs = [out];
          setProgress(100);
        }

        else if (tab === "pdf") {
          if (pdfOp === "pdf-to-png" || pdfOp === "pdf-to-jpg") {
            setStatusMsg("Rendering PDF pages…");
            const fmt = pdfOp === "pdf-to-png" ? "png" : "jpg";
            const out = await pdfToImages(files[0], fmt, (p) => setProgress(p));
            outputs = [out];
          } else if (pdfOp === "pdf-to-text") {
            setStatusMsg("Extracting text…");
            const out = await pdfToText(files[0], (p) => setProgress(p));
            outputs = [out];
          } else if (pdfOp === "images-to-pdf") {
            setStatusMsg("Building PDF…");
            const out = await imagesToPdf(files);
            baseName = "converted";
            outputs = [out];
            setProgress(100);
          } else if (pdfOp === "merge-pdf") {
            setStatusMsg("Merging PDFs…");
            const out = await mergePdfs(files);
            baseName = "merged";
            outputs = [out];
            setProgress(100);
          } else if (pdfOp === "split-pdf") {
            setStatusMsg("Splitting PDF…");
            const out = await splitPdf(files[0]);
            outputs = [out];
            setProgress(100);
          }
        }

        else if (tab === "documents") {
          if (docOp === "docx-to-pdf") {
            setStatusMsg("Rendering Word document to PDF…");
            outputs = [await docxToPdf(files[0])];
          } else if (docOp === "docx-to-html") {
            setStatusMsg("Converting to HTML…");
            outputs = [await docxToHtml(files[0])];
          } else if (docOp === "docx-to-text") {
            setStatusMsg("Extracting text…");
            outputs = [await docxToText(files[0])];
          }
          setProgress(100);
        }

        else if (tab === "spreadsheets") {
          if (sheetOp === "xlsx-to-pdf") {
            setStatusMsg("Rendering spreadsheet to PDF…");
            outputs = [await xlsxToPdf(files[0], (p) => setProgress(p))];
          } else if (sheetOp === "xlsx-to-csv") {
            setStatusMsg("Exporting CSV…");
            outputs = [await xlsxToCsv(files[0])];
          } else if (sheetOp === "xlsx-to-json") {
            setStatusMsg("Exporting JSON…");
            outputs = [await xlsxToJson(files[0])];
          } else if (sheetOp === "csv-to-xlsx") {
            setStatusMsg("Building Excel file…");
            outputs = [await csvToXlsx(files[0])];
          } else if (sheetOp === "csv-to-json") {
            setStatusMsg("Converting…");
            outputs = [await csvToJson(files[0])];
          } else if (sheetOp === "json-to-csv") {
            setStatusMsg("Converting…");
            outputs = [await jsonToCsv(files[0])];
          }
          setProgress(100);
        }

        else if (tab === "archives") {
          if (archiveOp === "files-to-zip") {
            setStatusMsg("Zipping files…");
            outputs = [await filesToZip(files)];
            baseName = "archive";
            setProgress(100);
          } else if (archiveOp === "extract-zip") {
            setStatusMsg("Extracting ZIP…");
            const extracted = await extractZip(files[0]);
            setExtractedFiles(extracted);
            setProgress(100);
            setStatusMsg("");
            setState("done");
            return;
          }
        }

        const convResults: ConvResult[] = outputs.map((o, i) => {
          const name = outputs.length > 1
            ? `${baseName}_${i + 1}.${o.ext}`
            : `${baseName}_converted.${o.ext}`;
          const url = URL.createObjectURL(o.blob);
          urlsRef.current.push(url);
          return { name, blob: o.blob, url, size: o.blob.size };
        });

        setResults(convResults);
        setStatusMsg("");
        setState("done");
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Conversion failed");
        setState("error");
      }
    },
    [tab, imgTo, pdfOp, docOp, sheetOp, archiveOp]
  );

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) handleFiles(files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFiles(files);
  }

  // ─── Hint text for drop zone ───────────────────────────────────────────────
  function dropHint(): string {
    if (tab === "images") return `${IMAGE_FORMATS.join(" · ")}`;
    if (tab === "pdf") {
      if (pdfOp === "images-to-pdf") return "PNG · JPG · WebP · HEIC (select multiple)";
      if (pdfOp === "merge-pdf") return "PDF files (select multiple)";
      return "PDF file";
    }
    if (tab === "documents") return "DOCX (Word document)";
    if (tab === "spreadsheets") {
      const op = SHEET_OPS.find((o) => o.id === sheetOp)!;
      if (sheetOp.startsWith("xlsx")) return "XLSX · XLS (Excel file)";
      if (sheetOp === "csv-to-xlsx" || sheetOp === "csv-to-json") return "CSV file";
      return "JSON file";
    }
    if (tab === "archives") {
      return archiveOp === "files-to-zip" ? "Any files (select multiple)" : "ZIP file";
    }
    return "file";
  }

  // ─── Render ────────────────────────────────────────────────────────────────
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
          <Link href="/compress">Compressor</Link>
          <Link href="/convert" style={{ color: "var(--ink-900)", fontWeight: 700 }}>Converter</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <div className="topbar-actions">
          <span className="forever-pill">Free · No signup</span>
          <Link href="/auth/login" className="action-btn">Sign in</Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "40px 0 28px" }}>
        <div style={S.pill}>
          <ArrowRight size={14} />
          Universal File Converter
        </div>
        <h1 style={S.hero}>Convert any file format, accurately</h1>
        <p style={S.sub}>
          Images, PDFs, Word, Excel, archives — converted locally in your browser.
          No uploads. No accounts. No limits.
        </p>
      </section>

      {/* Card */}
      <div style={S.card}>
        {/* Tabs */}
        <div style={S.tabRow}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => switchTab(t.id)} style={{ ...S.tabBtn, ...(active ? S.tabActive : {}) }}>
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "24px 28px 32px" }}>
          {/* ── Images op controls ── */}
          {tab === "images" && (
            <div style={S.opRow}>
              <div style={S.opGroup}>
                <label style={S.opLabel}>From</label>
                <div style={S.chipRow}>
                  {IMAGE_FORMATS.map((f) => (
                    <button key={f} onClick={() => setImgFrom(f)}
                      style={{ ...S.chip, ...(imgFrom === f ? S.chipActive : {}) }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <ArrowRight size={20} color="var(--ink-500)" style={{ marginTop: 22 }} />
              <div style={S.opGroup}>
                <label style={S.opLabel}>To</label>
                <div style={S.chipRow}>
                  {IMAGE_TO.filter((f) => f !== imgFrom).map((f) => (
                    <button key={f} onClick={() => setImgTo(f)}
                      style={{ ...S.chip, ...(imgTo === f ? S.chipActive : {}) }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PDF op selector ── */}
          {tab === "pdf" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10, marginBottom: 22 }}>
              {PDF_OPS.map((op) => {
                const Icon = op.icon;
                const active = pdfOp === op.id;
                return (
                  <button key={op.id} onClick={() => { reset(); setPdfOp(op.id); }}
                    style={{ ...S.opCard, ...(active ? S.opCardActive : {}) }}>
                    <Icon size={16} color={active ? "var(--mint)" : "var(--ink-500)"} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: active ? "var(--ink-900)" : "var(--ink-700)" }}>
                      {op.label}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-500)", lineHeight: 1.4 }}>{op.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Documents op selector ── */}
          {tab === "documents" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
              {DOC_OPS.map((op) => {
                const active = docOp === op.id;
                return (
                  <button key={op.id} onClick={() => { reset(); setDocOp(op.id); }}
                    style={{ ...S.opCard, flex: "1 1 180px", ...(active ? S.opCardActive : {}) }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: active ? "var(--ink-900)" : "var(--ink-700)" }}>
                      {op.label}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-500)", lineHeight: 1.4 }}>{op.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Spreadsheet op selector ── */}
          {tab === "spreadsheets" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 10, marginBottom: 22 }}>
              {SHEET_OPS.map((op) => {
                const active = sheetOp === op.id;
                return (
                  <button key={op.id} onClick={() => { reset(); setSheetOp(op.id); }}
                    style={{ ...S.opCard, ...(active ? S.opCardActive : {}) }}>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: active ? "var(--ink-900)" : "var(--ink-700)" }}>
                      {op.label}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-500)", lineHeight: 1.4 }}>{op.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Archive op selector ── */}
          {tab === "archives" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
              {ARCHIVE_OPS.map((op) => {
                const active = archiveOp === op.id;
                return (
                  <button key={op.id} onClick={() => { reset(); setArchiveOp(op.id); }}
                    style={{ ...S.opCard, flex: "1 1 200px", ...(active ? S.opCardActive : {}) }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: active ? "var(--ink-900)" : "var(--ink-700)" }}>
                      {op.label}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-500)", lineHeight: 1.4 }}>{op.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Drop zone */}
          {state === "idle" && (
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)} onDrop={onDrop}
              onClick={() => inputRef.current?.click()} style={{ ...S.drop, ...(dragging ? S.dropActive : {}) }}>
              <div style={{ ...S.dropIcon, ...(dragging ? S.dropIconActive : {}) }}>
                <Upload size={26} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 4, fontSize: "1.05rem" }}>
                  {isMulti() ? "Drop your files here" : "Drop your file here"}
                </p>
                <p style={{ color: "var(--ink-500)", fontSize: "0.88rem" }}>
                  or click to browse — {dropHint()}
                </p>
                {isMulti() && (
                  <p style={{ color: "var(--mint)", fontSize: "0.8rem", marginTop: 4, fontWeight: 600 }}>
                    Multiple files supported
                  </p>
                )}
              </div>
              <input ref={inputRef} type="file" accept={acceptStr()}
                multiple={isMulti()} style={{ display: "none" }} onChange={onInputChange} />
            </div>
          )}

          {/* Converting */}
          {state === "converting" && (
            <div style={S.stateBox}>
              <Loader2 size={38} color="var(--mint)" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 4 }}>{statusMsg || "Converting…"}</p>
                {progress > 0 && (
                  <p style={{ color: "var(--ink-500)", fontSize: "0.88rem" }}>{progress}% complete</p>
                )}
              </div>
              {progress > 0 && (
                <div style={{ width: "100%", maxWidth: 400, height: 6, background: "#e0e8f4", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "var(--mint)", borderRadius: 99, transition: "width 300ms ease" }} />
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div style={S.errorBox}>
              <AlertCircle size={36} color="var(--danger)" />
              <div>
                <p style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>Conversion failed</p>
                <p style={{ color: "var(--ink-500)", fontSize: "0.88rem" }}>{error}</p>
              </div>
              <button onClick={reset} style={S.dangerBtn}>Try again</button>
            </div>
          )}

          {/* Done — results */}
          {state === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Extracted ZIP files */}
              {extractedFiles.length > 0 && (
                <>
                  <div style={S.successBadge}>
                    <CheckCircle size={16} />
                    Extracted {extractedFiles.length} file{extractedFiles.length !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {extractedFiles.map((f) => {
                      const url = URL.createObjectURL(f.blob);
                      return (
                        <div key={f.name} style={S.resultRow}>
                          <span style={{ fontSize: "0.9rem", color: "var(--ink-700)", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.name}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--ink-500)", whiteSpace: "nowrap" }}>
                            {formatBytes(f.blob.size)}
                          </span>
                          <a href={url} download={f.name} style={S.dlSmall} onClick={() => setTimeout(() => URL.revokeObjectURL(url), 5000)}>
                            <Download size={14} /> Download
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Single or multi output */}
              {results.length > 0 && (
                <>
                  <div style={S.successBadge}>
                    <CheckCircle size={16} />
                    {results.length === 1 ? "File converted successfully" : `${results.length} files ready`}
                  </div>

                  {results.length === 1 ? (
                    <div style={S.singleResult}>
                      <div>
                        <p style={{ fontWeight: 700, color: "var(--ink-900)", fontSize: "0.97rem" }}>{results[0].name}</p>
                        <p style={{ color: "var(--ink-500)", fontSize: "0.83rem", marginTop: 2 }}>{formatBytes(results[0].size)}</p>
                      </div>
                      <a href={results[0].url} download={results[0].name} style={S.dlBtn}>
                        <Download size={18} /> Download
                      </a>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {results.map((r) => (
                        <div key={r.name} style={S.resultRow}>
                          <span style={{ fontSize: "0.9rem", color: "var(--ink-700)", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.name}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--ink-500)", whiteSpace: "nowrap" }}>
                            {formatBytes(r.size)}
                          </span>
                          <a href={r.url} download={r.name} style={S.dlSmall}>
                            <Download size={14} /> Download
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <button onClick={reset} style={S.resetBtn}>
                <X size={15} /> Convert another file
              </button>

              <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--ink-500)" }}>
                <CheckCircle size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Your file never leaves your device — all conversion runs locally in your browser.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pills */}
      <div style={S.pills}>
        {["100% private — runs in your browser", "No file size limits", "No account required", "Images · PDFs · Word · Excel · Archives"].map((t) => (
          <span key={t} style={S.pill2}>{t}</span>
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  pill: {
    display: "inline-flex", alignItems: "center", gap: 8,
    background: "#e0f0ff", border: "1px solid #90c0f0",
    borderRadius: 999, padding: "6px 14px", color: "#1a4d8a",
    fontWeight: 700, fontSize: "0.83rem", marginBottom: 16,
  },
  hero: {
    fontFamily: "Space Grotesk, Trebuchet MS, sans-serif",
    fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 700,
    color: "var(--ink-900)", lineHeight: 1.15, marginBottom: 10,
  },
  sub: { color: "var(--ink-500)", fontSize: "1.05rem", maxWidth: 560, margin: "0 auto" },
  card: {
    maxWidth: 820, margin: "0 auto",
    background: "var(--card)", border: "1px solid var(--line)",
    borderRadius: 18, boxShadow: "0 22px 45px rgba(13,32,74,0.09)", overflow: "hidden",
  },
  tabRow: { display: "flex", borderBottom: "1px solid var(--line)", background: "#f7faff", overflowX: "auto" },
  tabBtn: {
    flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center",
    gap: 6, padding: "13px 8px", background: "transparent",
    border: "none", borderBottom: "2px solid transparent",
    color: "var(--ink-500)", fontWeight: 500, fontSize: "0.88rem",
    cursor: "pointer", whiteSpace: "nowrap", transition: "all 160ms",
  },
  tabActive: {
    background: "var(--card)", borderBottomColor: "var(--mint)",
    color: "var(--ink-900)", fontWeight: 700,
  },
  opRow: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 22 },
  opGroup: { display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 200 },
  opLabel: { fontWeight: 700, color: "var(--ink-700)", fontSize: "0.9rem" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  chip: {
    padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)",
    background: "#f4f7ff", color: "var(--ink-700)", fontWeight: 600,
    fontSize: "0.85rem", cursor: "pointer", transition: "all 140ms",
  },
  chipActive: { background: "#daf3e8", borderColor: "#60c8a4", color: "#07593f" },
  opCard: {
    display: "flex", flexDirection: "column", gap: 5, padding: "12px 14px",
    border: "1px solid var(--line)", borderRadius: 12, background: "#f7faff",
    cursor: "pointer", textAlign: "left", transition: "all 140ms",
  },
  opCardActive: { background: "#edfaf5", borderColor: "#60c8a4", boxShadow: "0 0 0 2px #c4eedd" },
  drop: {
    border: "2px dashed var(--line)", borderRadius: 14, padding: "52px 28px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
    cursor: "pointer", background: "#fafbff", transition: "all 180ms",
  },
  dropActive: { border: "2px dashed var(--mint)", background: "#e8faf3" },
  dropIcon: {
    width: 60, height: 60, borderRadius: 16, background: "#eef2fc",
    display: "grid", placeItems: "center", color: "var(--ink-500)",
  },
  dropIconActive: { background: "#c8f0de", color: "var(--mint)" },
  stateBox: {
    border: "1px solid var(--line)", borderRadius: 14, padding: "48px 28px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 18, background: "#fafbff",
  },
  errorBox: {
    border: "1px solid #f0c0c5", borderRadius: 14, padding: "32px 28px", background: "#fef5f6",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center",
  },
  dangerBtn: {
    marginTop: 4, padding: "10px 22px", background: "var(--danger)",
    color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer",
  },
  successBadge: {
    display: "inline-flex", alignItems: "center", gap: 7, color: "#07593f",
    background: "#daf3e8", border: "1px solid #60c8a4",
    borderRadius: 99, padding: "6px 14px", fontWeight: 700, fontSize: "0.87rem",
    alignSelf: "flex-start",
  },
  singleResult: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 16, background: "#f7faff", border: "1px solid var(--line)",
    borderRadius: 12, padding: "16px 18px",
  },
  dlBtn: {
    display: "inline-flex", alignItems: "center", gap: 8,
    background: "var(--mint)", color: "#fff", borderRadius: 10,
    padding: "11px 20px", fontWeight: 700, fontSize: "0.93rem",
    textDecoration: "none", whiteSpace: "nowrap",
  },
  resultRow: {
    display: "flex", alignItems: "center", gap: 12,
    background: "#f7faff", border: "1px solid var(--line)",
    borderRadius: 10, padding: "10px 14px",
  },
  dlSmall: {
    display: "inline-flex", alignItems: "center", gap: 5,
    background: "var(--mint)", color: "#fff", borderRadius: 8,
    padding: "6px 12px", fontWeight: 700, fontSize: "0.8rem",
    textDecoration: "none", whiteSpace: "nowrap",
  },
  resetBtn: {
    display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
    padding: "12px 20px", background: "transparent", border: "1px solid var(--line)",
    borderRadius: 10, color: "var(--ink-700)", fontWeight: 600,
    cursor: "pointer", fontSize: "0.9rem",
  },
  pills: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 28, paddingBottom: 40 },
  pill2: {
    background: "rgba(255,255,255,0.8)", border: "1px solid var(--line)",
    borderRadius: 999, padding: "7px 14px", fontSize: "0.83rem",
    color: "var(--ink-500)", fontWeight: 600,
  },
};
