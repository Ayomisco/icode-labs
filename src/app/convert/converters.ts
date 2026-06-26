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

// ─── PDF → Word (DOCX) ────────────────────────────────────────────────────────

export async function pdfToDocx(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const pdfjsLib = await getPdfjs();
  const { Document, Paragraph, TextRun, Packer, PageBreak } = await import("docx");

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: data as unknown as Uint8Array }).promise;
  const numPages = pdf.numPages;
  const docChildren: InstanceType<Awaited<typeof import("docx")>["Paragraph"]>[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items into lines by rounding Y coordinate
    const lineMap = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !(item as { str: string }).str.trim()) continue;
      const it = item as { str: string; transform: number[] };
      const y = Math.round(it.transform[5] / 6) * 6;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: it.transform[4], str: it.str });
    }

    // Sort lines top-to-bottom (PDF Y is bottom-up, so sort descending)
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

    if (i > 1) {
      docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    for (const y of sortedYs) {
      const lineText = lineMap
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((t) => t.str)
        .join(" ")
        .trim();
      if (!lineText) continue;
      docChildren.push(
        new Paragraph({ children: [new TextRun({ text: lineText, size: 24, font: "Calibri" })] })
      );
    }

    onProgress?.(Math.round((i / numPages) * 100));
  }

  const doc = new Document({
    sections: [{ properties: {}, children: docChildren }],
  });

  return { blob: await Packer.toBlob(doc), ext: "docx" };
}

// ─── PDF → Excel (XLSX) ───────────────────────────────────────────────────────

export async function pdfToXlsx(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const pdfjsLib = await getPdfjs();
  const XLSX = await import("xlsx");

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: data as unknown as Uint8Array }).promise;
  const numPages = pdf.numPages;
  const wb = XLSX.utils.book_new();

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group items by rounded Y into rows, sort each row by X for columns
    const rowMap = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const it = item as { str: string; transform: number[] };
      const y = Math.round(it.transform[5] / 8) * 8;
      if (!rowMap.has(y)) rowMap.set(y, []);
      rowMap.get(y)!.push({ x: it.transform[4], str: it.str });
    }

    const sheetData: string[][] = Array.from(rowMap.keys())
      .sort((a, b) => b - a)
      .map((y) =>
        rowMap
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((t) => t.str.trim())
          .filter(Boolean)
      )
      .filter((row) => row.length > 0);

    const ws = XLSX.utils.aoa_to_sheet(sheetData.length ? sheetData : [["No extractable content"]]);
    XLSX.utils.book_append_sheet(wb, ws, `Page ${i}`);
    onProgress?.(Math.round((i / numPages) * 100));
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return {
    blob: new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    ext: "xlsx",
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
// Container matches US Letter at 96 dpi: 816px wide, 96px (1in) padding each side.
// That maps 1:1 to jsPDF Letter (612pt wide) via the 0.75 pt/px ratio at 96 dpi.

export async function docxToPdf(file: File): Promise<{ blob: Blob; ext: string }> {
  const mammoth = await import("mammoth");
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const data = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: data });

  const RENDER_SCALE = 3;
  const CONTAINER_PX = 816; // 8.5 in × 96 dpi = US Letter width
  const MARGIN_PX = 96;     // 1 in × 96 dpi = standard Word margin

  const container = document.createElement("div");
  container.style.cssText =
    `position:fixed;left:-9999px;top:0;width:${CONTAINER_PX}px;background:#fff;` +
    `padding:${MARGIN_PX}px;font-family:Calibri,'Segoe UI',Arial,sans-serif;` +
    `font-size:11pt;line-height:1.15;color:#000;box-sizing:border-box;word-wrap:break-word;`;

  container.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      p{margin:0 0 8pt;line-height:1.15;orphans:2;widows:2}
      h1{font-size:16pt;font-weight:700;color:#2E74B5;margin:16pt 0 4pt;line-height:1.1}
      h2{font-size:13pt;font-weight:700;color:#2E74B5;margin:14pt 0 4pt;line-height:1.1}
      h3{font-size:12pt;font-weight:700;color:#1F3864;margin:12pt 0 4pt;line-height:1.1}
      h4,h5,h6{font-size:11pt;font-weight:700;margin:10pt 0 4pt;line-height:1.1}
      table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt}
      td,th{border:1px solid #AEAAAA;padding:3pt 5.4pt;vertical-align:top;line-height:1.15}
      th{background:#4472C4;color:#fff;font-weight:700;text-align:left}
      tr:nth-child(even) td{background:#D9E2F3}
      ul,ol{margin:0 0 8pt;padding-left:18pt}
      li{margin-bottom:2pt;line-height:1.15}
      strong,b{font-weight:700}
      em,i{font-style:italic}
      u{text-decoration:underline}
      img{max-width:100%;height:auto}
      a{color:#0563C1;text-decoration:underline}
      blockquote{margin:0 0 8pt 18pt;border-left:3px solid #D0D0D0;padding-left:10pt;color:#404040}
      pre,code{font-family:'Courier New',monospace;font-size:9pt;background:#F5F5F5;padding:1pt 3pt;border-radius:2pt}
      hr{border:none;border-top:1px solid #D0D0D0;margin:8pt 0}
    </style>
    ${result.value}
  `;
  document.body.appendChild(container);

  const canvas = await html2canvas(container, {
    scale: RENDER_SCALE,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    imageTimeout: 15000,
  });
  document.body.removeChild(container);

  // 1 CSS px = 0.75 pt at 96 dpi. At render scale N, 1 pt = N/0.75 canvas pixels.
  const PT_PER_CANVAS_PX = 0.75 / RENDER_SCALE;
  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();   // 612 pt
  const pageH = pdf.internal.pageSize.getHeight();  // 792 pt
  const imgW = canvas.width * PT_PER_CANVAS_PX;     // should equal 612 pt
  const imgH = canvas.height * PT_PER_CANVAS_PX;
  const dataUrl = canvas.toDataURL("image/png");     // lossless for text sharpness

  let yPt = 0;
  let firstPage = true;
  while (yPt < imgH) {
    if (!firstPage) pdf.addPage();
    firstPage = false;
    pdf.addImage(dataUrl, "PNG", 0, -yPt, imgW, imgH);
    yPt += pageH;
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
  const full = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.15;
       color:#000;background:#fff;max-width:816px;margin:0 auto;padding:96px}
  p{margin:0 0 8pt;line-height:1.15}
  h1{font-size:16pt;font-weight:700;color:#2E74B5;margin:16pt 0 4pt}
  h2{font-size:13pt;font-weight:700;color:#2E74B5;margin:14pt 0 4pt}
  h3{font-size:12pt;font-weight:700;color:#1F3864;margin:12pt 0 4pt}
  h4,h5,h6{font-size:11pt;font-weight:700;margin:10pt 0 4pt}
  table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt}
  td,th{border:1px solid #AEAAAA;padding:3pt 5.4pt;vertical-align:top}
  th{background:#4472C4;color:#fff;font-weight:700;text-align:left}
  tr:nth-child(even) td{background:#D9E2F3}
  ul,ol{margin:0 0 8pt;padding-left:18pt}
  li{margin-bottom:2pt}
  strong,b{font-weight:700}
  em,i{font-style:italic}
  img{max-width:100%;height:auto}
  a{color:#0563C1;text-decoration:underline}
  blockquote{margin:0 0 8pt 18pt;border-left:3px solid #D0D0D0;padding-left:10pt;color:#404040}
  pre,code{font-family:'Courier New',monospace;font-size:9pt;background:#F5F5F5;padding:2pt 4pt;border-radius:2pt}
  hr{border:none;border-top:1px solid #D0D0D0;margin:8pt 0}
</style>
</head>
<body>${result.value}</body>
</html>`;
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
// Builds the HTML table manually so we can honour actual column widths and
// apply proper header/row styling rather than relying on sheet_to_html.

function xlsxEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function xlsxToPdf(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const XLSX = await import("xlsx");
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  const { PDFDocument } = await import("pdf-lib");

  const RENDER_SCALE = 3;
  const PT_PER_CANVAS_PX = 0.75 / RENDER_SCALE;

  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array", cellStyles: true, cellDates: true });
  const sheetPdfs: ArrayBuffer[] = [];

  for (let si = 0; si < wb.SheetNames.length; si++) {
    const sheetName = wb.SheetNames[si];
    const ws = wb.Sheets[sheetName];
    const ref = ws["!ref"];
    if (!ref) continue;

    const range = XLSX.utils.decode_range(ref);
    const colDefs = ws["!cols"] as Array<{ wpx?: number; wch?: number }> | undefined ?? [];
    const mergeDefs = (ws["!merges"] as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>) ?? [];

    // Build a merge lookup: "r,c" → { rowspan, colspan } for the top-left cell,
    // and "r,c" → "skip" for the covered cells.
    const mergeMap = new Map<string, { rowspan: number; colspan: number } | "skip">();
    for (const m of mergeDefs) {
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          const key = `${r},${c}`;
          if (r === m.s.r && c === m.s.c) {
            mergeMap.set(key, { rowspan: m.e.r - m.s.r + 1, colspan: m.e.c - m.s.c + 1 });
          } else {
            mergeMap.set(key, "skip");
          }
        }
      }
    }

    // Column widths in px (Excel default char width ≈ 7.5px, default wch = 8.43)
    const colWidthsPx: number[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const def = colDefs[c];
      colWidthsPx.push(def?.wpx ?? (def?.wch ? Math.round(def.wch * 7.5) : 80));
    }

    // Build table HTML
    let tableHtml = `<table style="border-collapse:collapse;border-spacing:0;font-family:Calibri,Arial,sans-serif;font-size:11px;table-layout:fixed">`;
    tableHtml += `<colgroup>`;
    for (const w of colWidthsPx) tableHtml += `<col style="width:${w}px">`;
    tableHtml += `</colgroup>`;

    for (let r = range.s.r; r <= range.e.r; r++) {
      const isHeader = r === range.s.r;
      const isEven = (r - range.s.r) % 2 === 1;
      const rowBg = isHeader ? "#17375E" : isEven ? "#D9E2F3" : "#FFFFFF";
      const rowColor = isHeader ? "#FFFFFF" : "#000000";
      const rowWeight = isHeader ? "700" : "400";

      tableHtml += `<tr>`;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const mergeInfo = mergeMap.get(`${r},${c}`);
        if (mergeInfo === "skip") continue;

        const cellAddr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellAddr];
        const raw = cell ? XLSX.utils.format_cell(cell) : "";
        const value = xlsxEscape(raw);

        let attrs = `style="border:1px solid #8EA9C1;padding:4px 6px;vertical-align:middle;` +
          `background:${rowBg};color:${rowColor};font-weight:${rowWeight};` +
          `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px"`;

        if (mergeInfo && typeof mergeInfo === "object") {
          if (mergeInfo.rowspan > 1) attrs += ` rowspan="${mergeInfo.rowspan}"`;
          if (mergeInfo.colspan > 1) attrs += ` colspan="${mergeInfo.colspan}"`;
        }

        tableHtml += `<td ${attrs}>${value}</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</table>`;

    const totalColW = colWidthsPx.reduce((a, b) => a + b, 0);
    const containerW = Math.max(totalColW + 48, 600);

    const container = document.createElement("div");
    container.style.cssText =
      `position:fixed;left:-9999px;top:0;background:#fff;padding:24px;` +
      `width:${containerW}px;box-sizing:border-box;`;
    container.innerHTML = `
      <div style="font-family:Calibri,Arial,sans-serif;font-size:13px;font-weight:700;color:#17375E;
                  margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #17375E">
        ${xlsxEscape(sheetName)}
      </div>
      ${tableHtml}
    `;
    document.body.appendChild(container);

    const canvas = await html2canvas(container, {
      scale: RENDER_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    document.body.removeChild(container);

    const imgW = canvas.width * PT_PER_CANVAS_PX;
    const imgH = canvas.height * PT_PER_CANVAS_PX;
    const isLandscape = imgW > 612;

    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: isLandscape ? "landscape" : "portrait",
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // Scale to fit page width with 24pt margin each side
    const margin = 24;
    const fitW = pageW - margin * 2;
    const scale = fitW / imgW;
    const scaledW = imgW * scale;
    const scaledH = imgH * scale;
    const dataUrl = canvas.toDataURL("image/png");

    let yPt = 0;
    let firstPage = true;
    while (yPt < scaledH) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      pdf.addImage(dataUrl, "PNG", margin, margin - yPt, scaledW, scaledH);
      yPt += pageH - margin * 2;
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
