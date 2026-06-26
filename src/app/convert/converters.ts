// ─── Image Conversions ────────────────────────────────────────────────────────

export async function convertImage(
  file: File,
  toFormat: "png" | "jpg" | "webp" | "bmp" | "pdf"
): Promise<{ blob: Blob; ext: string }> {
  // Decode HEIC first
  let source: File | Blob = file;
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    const heic2any = (await import("heic2any")).default;
    source = (await heic2any({ blob: file, toType: "image/png" })) as Blob;
  }

  if (toFormat === "pdf") {
    const f = file instanceof File ? file : new File([source], (file as File).name ?? "image.png");
    return imagesToPdf([f]);
  }

  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;

  if (toFormat === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }
  ctx.drawImage(bitmap, 0, 0);

  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    bmp: "image/bmp",
  };

  const blob = await canvas.convertToBlob({
    type: mimeMap[toFormat],
    quality: toFormat === "jpg" || toFormat === "webp" ? 0.92 : undefined,
  });

  return { blob, ext: toFormat === "jpg" ? "jpg" : toFormat };
}

// ─── Images → PDF ─────────────────────────────────────────────────────────────

export async function imagesToPdf(files: File[]): Promise<{ blob: Blob; ext: string }> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();

  for (const file of files) {
    let imgBytes: Uint8Array;

    // Handle HEIC
    let source: Blob = file;
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      const heic2any = (await import("heic2any")).default;
      source = (await heic2any({ blob: file, toType: "image/jpeg" })) as Blob;
    }

    imgBytes = new Uint8Array(await source.arrayBuffer());

    let img;
    const type = source.type || file.type;
    if (type === "image/png") {
      img = await pdf.embedPng(imgBytes);
    } else {
      // Convert anything non-PNG to JPEG via canvas
      const bitmap = await createImageBitmap(source);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      const jpgBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      imgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
      img = await pdf.embedJpg(imgBytes);
    }

    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const bytes = await pdf.save();
  return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), ext: "pdf" };
}

// ─── PDF → Images ─────────────────────────────────────────────────────────────

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).toString();
  }
  return pdfjsLib;
}

export async function pdfToImages(
  file: File,
  format: "png" | "jpg",
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: data as unknown as Uint8Array }).promise;
  const numPages = pdf.numPages;

  const canvases: Blob[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas }).promise;

    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), mimeType, 0.92)
    );
    canvases.push(blob);
    onProgress?.(Math.round((i / numPages) * 100));
  }

  if (canvases.length === 1) {
    return { blob: canvases[0], ext: format };
  }

  return zipBlobs(
    canvases.map((b, i) => ({
      name: `page-${String(i + 1).padStart(3, "0")}.${format}`,
      blob: b,
    }))
  );
}

// ─── PDF → Text ───────────────────────────────────────────────────────────────

export async function pdfToText(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: data as unknown as Uint8Array }).promise;
  const numPages = pdf.numPages;
  const lines: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
    lines.push(`--- Page ${i} ---\n${pageText}`);
    onProgress?.(Math.round((i / numPages) * 100));
  }

  return {
    blob: new Blob([lines.join("\n\n")], { type: "text/plain" }),
    ext: "txt",
  };
}

// ─── Merge PDFs ───────────────────────────────────────────────────────────────

export async function mergePdfs(files: File[]): Promise<{ blob: Blob; ext: string }> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  return {
    blob: new Blob([(await merged.save()).buffer as ArrayBuffer], { type: "application/pdf" }),
    ext: "pdf",
  };
}

// ─── Split PDF ────────────────────────────────────────────────────────────────

export async function splitPdf(file: File): Promise<{ blob: Blob; ext: string }> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const blobs: { name: string; blob: Blob }[] = [];

  for (let i = 0; i < src.getPageCount(); i++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(src, [i]);
    single.addPage(page);
    const bytes = await single.save();
    blobs.push({
      name: `page-${String(i + 1).padStart(3, "0")}.pdf`,
      blob: new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
    });
  }

  if (blobs.length === 1) return { blob: blobs[0].blob, ext: "pdf" };
  return zipBlobs(blobs);
}

// ─── DOCX → PDF ───────────────────────────────────────────────────────────────

export async function docxToPdf(file: File): Promise<{ blob: Blob; ext: string }> {
  const mammoth = await import("mammoth");
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const data = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: data });

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-9999px;top:0;width:794px;min-height:100px;background:#fff;" +
    "padding:72px 88px;font-family:'Times New Roman',Times,serif;font-size:12pt;" +
    "line-height:1.7;color:#000;box-sizing:border-box;";
  container.innerHTML = `
    <style>
      *{box-sizing:border-box}
      h1{font-size:22pt;margin:0 0 14px}
      h2{font-size:18pt;margin:12px 0 10px}
      h3{font-size:14pt;margin:10px 0 8px}
      h4,h5,h6{font-size:12pt;margin:8px 0 6px}
      p{margin:0 0 10px}
      table{border-collapse:collapse;width:100%;margin:14px 0}
      td,th{border:1px solid #888;padding:6px 10px;font-size:11pt}
      th{background:#e8e8e8;font-weight:700}
      ul,ol{margin:0 0 10px;padding-left:22px}
      li{margin-bottom:4px}
      strong,b{font-weight:700}
      em,i{font-style:italic}
      img{max-width:100%;height:auto}
      a{color:#1a0dab;text-decoration:underline}
    </style>
    ${result.value}
  `;
  document.body.appendChild(container);

  const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
  document.body.removeChild(container);

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * pageW) / canvas.width;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

  let remaining = imgH;
  let yOffset = 0;

  while (remaining > 0) {
    pdf.addImage(dataUrl, "JPEG", 0, -yOffset, imgW, imgH);
    remaining -= pageH;
    yOffset += pageH;
    if (remaining > 0) pdf.addPage();
  }

  return {
    blob: new Blob([pdf.output("arraybuffer")], { type: "application/pdf" }),
    ext: "pdf",
  };
}

// ─── DOCX → HTML ──────────────────────────────────────────────────────────────

export async function docxToHtml(file: File): Promise<{ blob: Blob; ext: string }> {
  const mammoth = await import("mammoth");
  const data = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: data });
  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.7;color:#111}
    h1,h2,h3{color:#1a1a2e}table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #ccc;padding:8px}th{background:#f0f0f0}
  </style></head><body>${result.value}</body></html>`;
  return { blob: new Blob([full], { type: "text/html" }), ext: "html" };
}

// ─── DOCX → Text ──────────────────────────────────────────────────────────────

export async function docxToText(file: File): Promise<{ blob: Blob; ext: string }> {
  const mammoth = await import("mammoth");
  const data = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return { blob: new Blob([result.value], { type: "text/plain" }), ext: "txt" };
}

// ─── XLSX → PDF ───────────────────────────────────────────────────────────────

export async function xlsxToPdf(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const XLSX = await import("xlsx");
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  const { PDFDocument } = await import("pdf-lib");

  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array", cellStyles: true, cellDates: true });
  const sheetPdfs: ArrayBuffer[] = [];

  for (let si = 0; si < wb.SheetNames.length; si++) {
    const sheetName = wb.SheetNames[si];
    const ws = wb.Sheets[sheetName];
    const html = XLSX.utils.sheet_to_html(ws, { id: "conv-table" });

    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;left:-9999px;top:0;background:#fff;padding:24px 20px;" +
      "font-family:Arial,sans-serif;font-size:11px;min-width:600px;box-sizing:border-box;";
    container.innerHTML = `
      <style>
        #conv-table{border-collapse:collapse;min-width:100%}
        #conv-table td,#conv-table th{border:1px solid #bbb;padding:4px 8px;white-space:nowrap;vertical-align:middle}
        #conv-table tr:first-child td,#conv-table tr:first-child th{background:#e8f0fe;font-weight:700;color:#1a237e}
        #conv-table tr:nth-child(even){background:#f8f9fa}
      </style>
      <div style="font-size:13px;font-weight:700;color:#333;margin-bottom:10px;border-bottom:2px solid #4285f4;padding-bottom:6px">
        ${sheetName}
      </div>
      ${html}
    `;
    document.body.appendChild(container);

    const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
    document.body.removeChild(container);

    const isLandscape = canvas.width > canvas.height;
    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: isLandscape ? "landscape" : "portrait",
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * pageW) / canvas.width;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    let remaining = imgH;
    let yOffset = 0;
    while (remaining > 0) {
      pdf.addImage(dataUrl, "JPEG", 0, -yOffset, imgW, imgH);
      remaining -= pageH;
      yOffset += pageH;
      if (remaining > 0) pdf.addPage();
    }

    sheetPdfs.push(pdf.output("arraybuffer"));
    onProgress?.(Math.round(((si + 1) / wb.SheetNames.length) * 100));
  }

  if (sheetPdfs.length === 1) {
    return { blob: new Blob([sheetPdfs[0]], { type: "application/pdf" }), ext: "pdf" };
  }

  const merged = await PDFDocument.create();
  for (const ab of sheetPdfs) {
    const src = await PDFDocument.load(ab);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  return {
    blob: new Blob([(await merged.save()).buffer as ArrayBuffer], { type: "application/pdf" }),
    ext: "pdf",
  };
}

// ─── Spreadsheet Conversions ──────────────────────────────────────────────────

export async function xlsxToCsv(file: File): Promise<{ blob: Blob; ext: string }> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const csvParts: string[] = [];

  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    csvParts.push(wb.SheetNames.length > 1 ? `# ${name}\n${csv}` : csv);
  }

  return {
    blob: new Blob([csvParts.join("\n\n")], { type: "text/csv" }),
    ext: "csv",
  };
}

export async function csvToXlsx(file: File): Promise<{ blob: Blob; ext: string }> {
  const XLSX = await import("xlsx");
  const text = await file.text();
  const ws = XLSX.utils.aoa_to_sheet(
    text.split("\n").map((row) => row.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return {
    blob: new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    ext: "xlsx",
  };
}

export async function xlsxToJson(file: File): Promise<{ blob: Blob; ext: string }> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const result: Record<string, unknown[]> = {};
  for (const name of wb.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]);
  }
  const json = wb.SheetNames.length === 1
    ? result[wb.SheetNames[0]]
    : result;
  return {
    blob: new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
    ext: "json",
  };
}

export async function jsonToCsv(file: File): Promise<{ blob: Blob; ext: string }> {
  const text = await file.text();
  const arr = JSON.parse(text);
  const rows = Array.isArray(arr) ? arr : [arr];
  if (rows.length === 0) return { blob: new Blob([""]), ext: "csv" };
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row: Record<string, unknown>) =>
      headers.map((h) => {
        const v = String(row[h] ?? "");
        return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    ),
  ];
  return { blob: new Blob([lines.join("\n")], { type: "text/csv" }), ext: "csv" };
}

export async function csvToJson(file: File): Promise<{ blob: Blob; ext: string }> {
  const text = await file.text();
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
  return {
    blob: new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }),
    ext: "json",
  };
}

// ─── Archive ──────────────────────────────────────────────────────────────────

export async function filesToZip(files: File[]): Promise<{ blob: Blob; ext: string }> {
  const { zip } = await import("fflate");
  const fileMap: Record<string, Uint8Array> = {};
  for (const file of files) {
    fileMap[file.name] = new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    zip(fileMap, (err, data) => {
      if (err) return reject(err);
      resolve({ blob: new Blob([data], { type: "application/zip" }), ext: "zip" });
    });
  });
}

export async function extractZip(
  file: File
): Promise<{ name: string; blob: Blob }[]> {
  const { unzip } = await import("fflate");
  const data = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    unzip(data, (err, files) => {
      if (err) return reject(err);
      const results = Object.entries(files)
        .filter(([name]) => !name.endsWith("/"))
        .map(([name, bytes]) => ({
          name,
          blob: new Blob([bytes]),
        }));
      resolve(results);
    });
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

async function zipBlobs(
  items: { name: string; blob: Blob }[]
): Promise<{ blob: Blob; ext: string }> {
  const { zip } = await import("fflate");
  const fileMap: Record<string, Uint8Array> = {};
  for (const item of items) {
    fileMap[item.name] = new Uint8Array(await item.blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    zip(fileMap, (err, data) => {
      if (err) return reject(err);
      resolve({ blob: new Blob([data], { type: "application/zip" }), ext: "zip" });
    });
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}
