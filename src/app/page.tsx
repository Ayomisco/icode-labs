"use client";

import {
  AtSign,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageCircle,
  Phone,
  QrCode,
  Share2,
  Smartphone,
  Type,
  Video,
  Wallet,
  Wifi,
} from "lucide-react";
import NextImage from "next/image";
import { ChangeEvent, ElementType, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type UseCaseId =
  | "link"
  | "text"
  | "email"
  | "call"
  | "sms"
  | "vcard"
  | "whatsapp"
  | "wifi"
  | "pdf"
  | "app"
  | "images"
  | "video"
  | "social"
  | "event"
  | "barcode2d";

type UseCase = {
  id: UseCaseId;
  title: string;
  icon: ElementType;
};

type FormState = {
  link: string;
  text: string;
  email: string;
  emailSubject: string;
  emailBody: string;
  call: string;
  smsNumber: string;
  smsMessage: string;
  vName: string;
  vCompany: string;
  vPhone: string;
  vEmail: string;
  whatsapp: string;
  whatsappMessage: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiEncryption: "WPA" | "WEP" | "nopass";
  wifiHidden: boolean;
  pdf: string;
  app: string;
  images: string;
  video: string;
  social: string;
  eventTitle: string;
  eventLocation: string;
  eventStart: string;
  eventEnd: string;
  eventDescription: string;
  barcode2d: string;
};

type DesignTab = "frame" | "shape" | "logo";
type FrameStyle = "Clean" | "Rounded" | "Ticket";
type ShapeStyle = "Square" | "Rounded" | "Stripe" | "Blob" | "Pixel" | "Wave" | "Corner" | "Dot";
type BorderStyle = "Square" | "Rounded" | "Circle" | "Arc" | "Leaf" | "Eye" | "Solid" | "Squircle";
type CenterStyle = "Square" | "Rounded" | "Circle" | "Arc" | "Sun" | "Star" | "Diamond" | "Plus";

const useCases: UseCase[] = [
  { id: "link", title: "Link", icon: LinkIcon },
  { id: "text", title: "Text", icon: Type },
  { id: "email", title: "E-mail", icon: AtSign },
  { id: "call", title: "Call", icon: Phone },
  { id: "sms", title: "SMS", icon: MessageCircle },
  { id: "vcard", title: "V-card", icon: Wallet },
  { id: "whatsapp", title: "WhatsApp", icon: MessageCircle },
  { id: "wifi", title: "WI-FI", icon: Wifi },
  { id: "pdf", title: "PDF", icon: FileText },
  { id: "app", title: "App", icon: Smartphone },
  { id: "images", title: "Images", icon: ImageIcon },
  { id: "video", title: "Video", icon: Video },
  { id: "social", title: "Social Media", icon: Share2 },
  { id: "event", title: "Event", icon: CalendarDays },
  { id: "barcode2d", title: "2D Barcode", icon: QrCode },
];

const defaultForm: FormState = {
  link: "https://",
  text: "",
  email: "",
  emailSubject: "",
  emailBody: "",
  call: "",
  smsNumber: "",
  smsMessage: "",
  vName: "",
  vCompany: "",
  vPhone: "",
  vEmail: "",
  whatsapp: "",
  whatsappMessage: "",
  wifiSsid: "",
  wifiPassword: "",
  wifiEncryption: "WPA",
  wifiHidden: false,
  pdf: "https://",
  app: "https://",
  images: "https://",
  video: "https://",
  social: "https://",
  eventTitle: "",
  eventLocation: "",
  eventStart: "",
  eventEnd: "",
  eventDescription: "",
  barcode2d: "",
};

const frameStyles: FrameStyle[] = ["Clean", "Rounded", "Ticket"];
const shapeStyles: ShapeStyle[] = ["Square", "Rounded", "Stripe", "Blob", "Pixel", "Wave", "Corner", "Dot"];
const borderStyles: BorderStyle[] = ["Square", "Rounded", "Circle", "Arc", "Leaf", "Eye", "Solid", "Squircle"];
const centerStyles: CenterStyle[] = ["Square", "Rounded", "Circle", "Arc", "Sun", "Star", "Diamond", "Plus"];

const presetLogos: { name: string; data: string }[] = [
  {
    name: "Link",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='%238632ea'/><circle cx='45' cy='60' r='18' fill='none' stroke='white' stroke-width='9'/><circle cx='75' cy='60' r='18' fill='none' stroke='white' stroke-width='9'/></svg>",
  },
  {
    name: "Mail",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='%23f0ab1a'/><rect x='24' y='34' width='72' height='52' rx='8' fill='white'/><path d='M24 40l36 25 36-25' stroke='%23f0ab1a' stroke-width='6' fill='none'/></svg>",
  },
  {
    name: "WhatsApp",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='%2328b15d'/><circle cx='60' cy='58' r='26' fill='white'/><path d='M49 49c4-8 10-8 14 0l8 8c4 8-2 14-10 12-10-2-18-10-20-20-2-8 4-14 8-10z' fill='%2328b15d'/></svg>",
  },
  {
    name: "WiFi",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='%232289d5'/><path d='M30 58c16-16 44-16 60 0' stroke='white' stroke-width='8' fill='none'/><path d='M40 70c10-10 30-10 40 0' stroke='white' stroke-width='8' fill='none'/><circle cx='60' cy='84' r='6' fill='white'/></svg>",
  },
  {
    name: "Pay",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='%230069b7'/><text x='50%25' y='58%25' text-anchor='middle' fill='white' font-size='36' font-family='Arial' font-weight='700'>Pay</text></svg>",
  },
  {
    name: "Coin",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='24' fill='%23f7931a'/><circle cx='60' cy='60' r='30' fill='white'/><text x='50%25' y='59%25' text-anchor='middle' fill='%23f7931a' font-size='42' font-family='Arial' font-weight='700'>B</text></svg>",
  },
];

const scanBadgePresets: { name: string; data: string }[] = [
  {
    name: "Scan Me 1",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='90'><rect width='180' height='90' rx='14' fill='white' stroke='%231f2f56' stroke-width='4'/><text x='50%25' y='56%25' text-anchor='middle' fill='%231f2f56' font-size='27' font-family='Arial' font-weight='700'>SCAN ME</text></svg>",
  },
  {
    name: "Scan Me 2",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='90'><rect width='180' height='90' rx='14' fill='white' stroke='%231f2f56' stroke-width='4'/><text x='50%25' y='48%25' text-anchor='middle' fill='%231f2f56' font-size='22' font-family='Arial' font-weight='700'>SCAN</text><text x='50%25' y='74%25' text-anchor='middle' fill='%231f2f56' font-size='24' font-family='Arial' font-weight='700'>ME</text></svg>",
  },
  {
    name: "Scan Me 3",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='90'><rect width='180' height='90' rx='14' fill='white' stroke='%231f2f56' stroke-width='4'/><rect x='15' y='20' width='26' height='26' fill='%231f2f56'/><rect x='139' y='44' width='26' height='26' fill='%231f2f56'/><text x='50%25' y='58%25' text-anchor='middle' fill='%231f2f56' font-size='22' font-family='Arial' font-weight='700'>SCAN</text></svg>",
  },
  {
    name: "Scan Me 4",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='90'><rect width='180' height='90' rx='14' fill='white' stroke='%231f2f56' stroke-width='4'/><path d='M35 28h20v20M145 62h-20v-20' stroke='%231f2f56' stroke-width='6' fill='none'/><text x='50%25' y='58%25' text-anchor='middle' fill='%231f2f56' font-size='24' font-family='Arial' font-weight='700'>SCAN</text></svg>",
  },
  {
    name: "Scan Me 5",
    data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='90'><rect width='180' height='90' rx='14' fill='white' stroke='%231f2f56' stroke-width='4'/><text x='50%25' y='56%25' text-anchor='middle' fill='%231f2f56' font-size='24' font-family='Arial' font-weight='700'>[ ]</text></svg>",
  },
];

function ensureUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

function cleanPhone(input: string): string {
  return input.replace(/[^+\d]/g, "");
}

function toIcsDate(input: string): string {
  return input ? `${input.replaceAll("-", "")}T000000` : "";
}

function buildPayload(useCase: UseCaseId, form: FormState): { payload: string; error: string } {
  switch (useCase) {
    case "link": {
      const url = ensureUrl(form.link);
      return url ? { payload: url, error: "" } : { payload: "", error: "Enter your website URL." };
    }
    case "text": {
      return form.text.trim() ? { payload: form.text.trim(), error: "" } : { payload: "", error: "Enter the text to encode." };
    }
    case "email": {
      if (!form.email.trim()) return { payload: "", error: "Enter an email address." };
      return {
        payload: `mailto:${form.email.trim()}?subject=${encodeURIComponent(form.emailSubject.trim())}&body=${encodeURIComponent(form.emailBody.trim())}`,
        error: "",
      };
    }
    case "call": {
      const phone = cleanPhone(form.call);
      return phone ? { payload: `tel:${phone}`, error: "" } : { payload: "", error: "Enter a phone number." };
    }
    case "sms": {
      const phone = cleanPhone(form.smsNumber);
      if (!phone) return { payload: "", error: "Enter the recipient phone number." };
      return { payload: `smsto:${phone}:${encodeURIComponent(form.smsMessage.trim())}`, error: "" };
    }
    case "vcard": {
      if (!form.vName.trim()) return { payload: "", error: "Enter a contact name for vCard." };
      const card = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${form.vName.trim()}`,
        `ORG:${form.vCompany.trim()}`,
        `TEL:${cleanPhone(form.vPhone)}`,
        `EMAIL:${form.vEmail.trim()}`,
        "END:VCARD",
      ].join("\n");
      return { payload: card, error: "" };
    }
    case "whatsapp": {
      const phone = cleanPhone(form.whatsapp);
      if (!phone) return { payload: "", error: "Enter a WhatsApp phone number." };
      return { payload: `https://wa.me/${phone}?text=${encodeURIComponent(form.whatsappMessage.trim())}`, error: "" };
    }
    case "wifi": {
      if (!form.wifiSsid.trim()) return { payload: "", error: "Enter a Wi-Fi network name (SSID)." };
      const hidden = form.wifiHidden ? "true" : "false";
      return {
        payload: `WIFI:T:${form.wifiEncryption};S:${form.wifiSsid.trim()};P:${form.wifiPassword.trim()};H:${hidden};;`,
        error: "",
      };
    }
    case "pdf":
      return ensureUrl(form.pdf) ? { payload: ensureUrl(form.pdf), error: "" } : { payload: "", error: "Enter your PDF URL." };
    case "app":
      return ensureUrl(form.app) ? { payload: ensureUrl(form.app), error: "" } : { payload: "", error: "Enter your app URL." };
    case "images":
      return ensureUrl(form.images) ? { payload: ensureUrl(form.images), error: "" } : { payload: "", error: "Enter your image URL." };
    case "video":
      return ensureUrl(form.video) ? { payload: ensureUrl(form.video), error: "" } : { payload: "", error: "Enter your video URL." };
    case "social":
      return ensureUrl(form.social) ? { payload: ensureUrl(form.social), error: "" } : { payload: "", error: "Enter your social profile URL." };
    case "event": {
      if (!form.eventTitle.trim()) return { payload: "", error: "Enter an event title." };
      if (!form.eventStart.trim()) return { payload: "", error: "Select an event start date." };
      const eventText = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        `SUMMARY:${form.eventTitle.trim()}`,
        `LOCATION:${form.eventLocation.trim()}`,
        `DTSTART:${toIcsDate(form.eventStart)}`,
        form.eventEnd ? `DTEND:${toIcsDate(form.eventEnd)}` : "",
        `DESCRIPTION:${form.eventDescription.trim()}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join("\n");
      return { payload: eventText, error: "" };
    }
    case "barcode2d":
      return form.barcode2d.trim() ? { payload: form.barcode2d.trim(), error: "" } : { payload: "", error: "Enter barcode data." };
    default:
      return { payload: "", error: "Select a use case." };
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = source;
  });
}

function mixHexColors(colorA: string, colorB: string, ratio: number) {
  const normalize = (hex: string) => {
    const value = hex.replace("#", "");
    return value.length === 3 ? value.split("").map((v) => `${v}${v}`).join("") : value;
  };
  const a = normalize(colorA);
  const b = normalize(colorB);
  const red = Math.round(parseInt(a.slice(0, 2), 16) + (parseInt(b.slice(0, 2), 16) - parseInt(a.slice(0, 2), 16)) * ratio);
  const green = Math.round(parseInt(a.slice(2, 4), 16) + (parseInt(b.slice(2, 4), 16) - parseInt(a.slice(2, 4), 16)) * ratio);
  const blue = Math.round(parseInt(a.slice(4, 6), 16) + (parseInt(b.slice(4, 6), 16) - parseInt(a.slice(4, 6), 16)) * ratio);
  return { red, green, blue };
}

async function applyGradient(baseDataUrl: string, width: number, start: string, end: string, transparent: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return baseDataUrl;

  const source = await loadImage(baseDataUrl);
  context.drawImage(source, 0, 0, width, width);

  const imageData = context.getImageData(0, 0, width, width);
  const px = imageData.data;

  for (let index = 0; index < px.length; index += 4) {
    const x = (index / 4) % width;
    const y = Math.floor(index / 4 / width);
    const luminance = (px[index] + px[index + 1] + px[index + 2]) / 3;
    if (px[index + 3] === 0) continue;

    if (luminance < 120) {
      const ratio = (x + y) / (width * 2);
      const color = mixHexColors(start, end, ratio);
      px[index] = color.red;
      px[index + 1] = color.green;
      px[index + 2] = color.blue;
      px[index + 3] = 255;
    } else if (transparent) {
      px[index + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export default function Home() {
  const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("link");
  const [form, setForm] = useState<FormState>(defaultForm);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [error, setError] = useState("");
  const [designTab, setDesignTab] = useState<DesignTab>("frame");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("Clean");
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>("Square");
  const [borderStyle, setBorderStyle] = useState<BorderStyle>("Square");
  const [centerStyle, setCenterStyle] = useState<CenterStyle>("Square");
  const [size, setSize] = useState(460);
  const [margin, setMargin] = useState(2);
  const [ecLevel, setEcLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [darkColor, setDarkColor] = useState("#111827");
  const [lightColor, setLightColor] = useState("#ffffff");
  const [borderColor, setBorderColor] = useState("#2f3f66");
  const [centerColor, setCenterColor] = useState("#2f3f66");
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [gradientColor, setGradientColor] = useState("#0f7bd9");
  const [transparentBg, setTransparentBg] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const active = useMemo(() => useCases.find((item) => item.id === activeUseCase) ?? useCases[0], [activeUseCase]);
  const payloadDetails = useMemo(() => buildPayload(activeUseCase, form), [activeUseCase, form]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      if (payloadDetails.error) {
        setError(payloadDetails.error);
        setQrDataUrl("");
        return;
      }

      setError("");
      setIsGenerating(true);

      try {
        const baseDataUrl = await QRCode.toDataURL(payloadDetails.payload, {
          width: size,
          margin,
          errorCorrectionLevel: ecLevel,
          color: {
            dark: darkColor,
            light: transparentBg ? "#0000" : lightColor,
          },
        });

        const finalDataUrl = gradientEnabled
          ? await applyGradient(baseDataUrl, size, darkColor, gradientColor, transparentBg)
          : baseDataUrl;

        if (!cancelled) {
          setQrDataUrl(finalDataUrl);
        }
      } catch {
        if (!cancelled) setError("Unable to generate QR code. Check your data and try again.");
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    }, 170);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [ecLevel, darkColor, gradientColor, gradientEnabled, lightColor, margin, payloadDetails, size, transparentBg]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clearAll = () => {
    setForm(defaultForm);
    setLogoDataUrl("");
    setDesignTab("frame");
    setFrameStyle("Clean");
    setShapeStyle("Square");
    setBorderStyle("Square");
    setCenterStyle("Square");
    setSize(460);
    setMargin(2);
    setEcLevel("M");
    setDarkColor("#111827");
    setLightColor("#ffffff");
    setBorderColor("#2f3f66");
    setCenterColor("#2f3f66");
    setGradientEnabled(false);
    setGradientColor("#0f7bd9");
    setTransparentBg(false);
  };

  const downloadQr = async () => {
    if (!qrDataUrl) return;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;

    const qrImage = await loadImage(qrDataUrl);
    context.drawImage(qrImage, 0, 0, size, size);

    if (logoDataUrl) {
      const logo = await loadImage(logoDataUrl);
      const box = Math.floor(size * 0.24);
      const pad = Math.floor(size * 0.028);
      const x = Math.floor((size - box) / 2);
      const y = Math.floor((size - box) / 2);

      context.fillStyle = transparentBg ? "rgba(255,255,255,0.82)" : "#ffffff";
      context.beginPath();
      context.roundRect(x - pad, y - pad, box + pad * 2, box + pad * 2, 14);
      context.fill();
      context.drawImage(logo, x, y, box, box);
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `icode-${activeUseCase}.png`;
    link.click();
  };

  const frameClass = frameStyle === "Rounded" ? "qr-preview-frame rounded" : frameStyle === "Ticket" ? "qr-preview-frame ticket" : "qr-preview-frame";

  const shapeClass =
    shapeStyle === "Rounded"
      ? "qr-preview-inner soft"
      : shapeStyle === "Dot"
        ? "qr-preview-inner dot"
        : shapeStyle === "Pixel" || shapeStyle === "Stripe"
          ? "qr-preview-inner pixel"
          : shapeStyle === "Blob" || shapeStyle === "Wave"
            ? "qr-preview-inner wave"
            : shapeStyle === "Corner"
              ? "qr-preview-inner corner"
              : "qr-preview-inner";

  const borderClass =
    borderStyle === "Rounded"
      ? "preview-shell border-rounded"
      : borderStyle === "Circle"
        ? "preview-shell border-circle"
        : borderStyle === "Arc"
          ? "preview-shell border-arc"
          : borderStyle === "Leaf"
            ? "preview-shell border-leaf"
            : borderStyle === "Eye"
              ? "preview-shell border-eye"
              : borderStyle === "Solid"
                ? "preview-shell border-solid"
                : borderStyle === "Squircle"
                  ? "preview-shell border-squircle"
                  : "preview-shell";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark" aria-hidden>
            <NextImage src="/icode-logo.svg" alt="icode logo" width={34} height={34} priority />
          </div>
          <div className="brand-text">icode</div>
        </div>
        <div className="topbar-actions">
          <div className="forever-pill">Static QR Forever</div>
          <button type="button" className="action-btn" onClick={clearAll}>
            Reset Builder
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="left-column">
          <div className="use-case-grid" role="tablist" aria-label="QR use cases">
            {useCases.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === activeUseCase ? "use-case active" : "use-case"}
                  onClick={() => setActiveUseCase(item.id)}
                >
                  <Icon size={15} />
                  <span>{item.title}</span>
                </button>
              );
            })}
          </div>

          <section className="panel step-panel">
            <h2>
              <span>1</span>
              Complete the content
            </h2>
            <p>Configure your {active.title} QR content.</p>
            <div className="field-grid">{renderFields(activeUseCase, form, update)}</div>
          </section>

          <section className="panel step-panel">
            <h2>
              <span>2</span>
              Design your QR Code
            </h2>

            <div className="designer-tabs">
              {(["frame", "shape", "logo"] as DesignTab[]).map((item) => (
                <button key={item} type="button" className={designTab === item ? "tab active" : "tab"} onClick={() => setDesignTab(item)}>
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>

            {designTab === "frame" && (
              <div className="design-section-grid">
                <div className="choice-strip">
                  {frameStyles.map((item) => (
                    <button key={item} type="button" className={frameStyle === item ? "choice-card active" : "choice-card"} onClick={() => setFrameStyle(item)}>
                      <span className={`mini-frame ${item.toLowerCase()}`} />
                      {item}
                    </button>
                  ))}
                </div>

                <div className="design-grid">
                  <label>
                    Size: {size}px
                    <input type="range" min={240} max={640} value={size} onChange={(event) => setSize(Number(event.target.value))} />
                  </label>
                  <label>
                    Margin: {margin}
                    <input type="range" min={0} max={8} value={margin} onChange={(event) => setMargin(Number(event.target.value))} />
                  </label>
                  <label>
                    Error Correction
                    <select value={ecLevel} onChange={(event) => setEcLevel(event.target.value as "L" | "M" | "Q" | "H")}>
                      <option value="L">L (7%)</option>
                      <option value="M">M (15%)</option>
                      <option value="Q">Q (25%)</option>
                      <option value="H">H (30%)</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {designTab === "shape" && (
              <div className="design-section-grid">
                <h3>Shape & Color</h3>

                <div className="design-group-card">
                  <h4>Shape style</h4>
                  <div className="style-button-grid">
                    {shapeStyles.map((item) => (
                      <button key={item} type="button" className={shapeStyle === item ? "style-icon-btn active" : "style-icon-btn"} onClick={() => setShapeStyle(item)} title={item}>
                        <span className={`mini-shape ${item.toLowerCase()}`} />
                      </button>
                    ))}
                  </div>
                  <div className="color-control-panel two-col">
                    <label>
                      Background color
                      <input type="color" value={lightColor} onChange={(event) => setLightColor(event.target.value)} disabled={transparentBg} />
                    </label>
                    <label>
                      Shape color
                      <input type="color" value={darkColor} onChange={(event) => setDarkColor(event.target.value)} />
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={transparentBg} onChange={(event) => setTransparentBg(event.target.checked)} />
                      Transparent background
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={gradientEnabled} onChange={(event) => setGradientEnabled(event.target.checked)} />
                      Gradient
                    </label>
                    {gradientEnabled && (
                      <label>
                        Gradient end
                        <input type="color" value={gradientColor} onChange={(event) => setGradientColor(event.target.value)} />
                      </label>
                    )}
                  </div>
                </div>

                <div className="design-group-card">
                  <h4>Border style</h4>
                  <div className="style-button-grid">
                    {borderStyles.map((item) => (
                      <button key={item} type="button" className={borderStyle === item ? "style-icon-btn active" : "style-icon-btn"} onClick={() => setBorderStyle(item)} title={item}>
                        <span className={`mini-border ${item.toLowerCase()}`} />
                      </button>
                    ))}
                  </div>
                  <div className="color-control-panel">
                    <label>
                      Border color
                      <input type="color" value={borderColor} onChange={(event) => setBorderColor(event.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="design-group-card">
                  <h4>Center style</h4>
                  <div className="style-button-grid">
                    {centerStyles.map((item) => (
                      <button key={item} type="button" className={centerStyle === item ? "style-icon-btn active" : "style-icon-btn"} onClick={() => setCenterStyle(item)} title={item}>
                        <span className={`mini-center ${item.toLowerCase()}`} />
                      </button>
                    ))}
                  </div>
                  <div className="color-control-panel">
                    <label>
                      Center color
                      <input type="color" value={centerColor} onChange={(event) => setCenterColor(event.target.value)} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {designTab === "logo" && (
              <div className="design-section-grid">
                <label className="logo-upload wide">
                  Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} />
                </label>
                <p className="logo-helper">Or choose from here</p>

                <div className="logo-preset-grid">
                  <button type="button" className={logoDataUrl === "" ? "logo-preset active" : "logo-preset"} onClick={() => setLogoDataUrl("")} title="Remove icon">
                    X
                  </button>
                  {presetLogos.map((item) => (
                    <button key={item.name} type="button" className={logoDataUrl === item.data ? "logo-preset active" : "logo-preset"} onClick={() => setLogoDataUrl(item.data)} title={item.name}>
                      <NextImage src={item.data} alt={item.name} width={36} height={36} unoptimized />
                    </button>
                  ))}
                </div>

                <div className="scan-badge-grid">
                  {scanBadgePresets.map((item) => (
                    <button key={item.name} type="button" className={logoDataUrl === item.data ? "scan-badge-btn active" : "scan-badge-btn"} onClick={() => setLogoDataUrl(item.data)} title={item.name}>
                      <NextImage src={item.data} alt={item.name} width={72} height={34} unoptimized />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </section>

        <aside className="right-column panel">
          <h2>
            <span>3</span>
            Download QR Code
          </h2>

          <div className={`${frameClass} ${borderClass}`} style={{ borderColor }}>
            {isGenerating && <div className="placeholder">Generating...</div>}
            {!isGenerating && qrDataUrl && (
              <div className={shapeClass}>
                <NextImage src={qrDataUrl} alt="Generated QR code" className="qr-image" fill unoptimized sizes="(max-width: 760px) 80vw, 280px" />
                {logoDataUrl && (
                  <NextImage
                    src={logoDataUrl}
                    alt="Uploaded logo"
                    className={`logo-overlay ${centerStyle.toLowerCase()}`}
                    width={70}
                    height={70}
                    style={{ borderColor: centerColor }}
                    unoptimized
                  />
                )}
              </div>
            )}
            {!isGenerating && !qrDataUrl && <div className="placeholder">Your QR preview appears here.</div>}
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="button" className="download-btn" onClick={downloadQr} disabled={!qrDataUrl}>
            Download QR Code
          </button>

          <p className="forever-note">Static QR codes generated by icode never expire. They are fully yours and keep working forever.</p>
        </aside>
      </main>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "date" | "url";
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="textarea-wrap">
      {label}
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function renderFields(
  useCase: UseCaseId,
  form: FormState,
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void,
) {
  switch (useCase) {
    case "link":
      return <InputField label="Enter your Website" value={form.link} placeholder="https://your-site.com" type="url" onChange={(value) => update("link", value)} />;
    case "text":
      return <TextareaField label="Enter your text" value={form.text} placeholder="Write your text content" onChange={(value) => update("text", value)} />;
    case "email":
      return (
        <>
          <InputField label="Recipient email" value={form.email} type="email" onChange={(value) => update("email", value)} />
          <InputField label="Subject" value={form.emailSubject} onChange={(value) => update("emailSubject", value)} />
          <TextareaField label="Message" value={form.emailBody} onChange={(value) => update("emailBody", value)} />
        </>
      );
    case "call":
      return <InputField label="Phone number" value={form.call} onChange={(value) => update("call", value)} placeholder="+1 202 555 0148" />;
    case "sms":
      return (
        <>
          <InputField label="Recipient number" value={form.smsNumber} onChange={(value) => update("smsNumber", value)} placeholder="+1 202 555 0148" />
          <TextareaField label="Message" value={form.smsMessage} onChange={(value) => update("smsMessage", value)} />
        </>
      );
    case "vcard":
      return (
        <>
          <InputField label="Full name" value={form.vName} onChange={(value) => update("vName", value)} />
          <InputField label="Company" value={form.vCompany} onChange={(value) => update("vCompany", value)} />
          <InputField label="Phone" value={form.vPhone} onChange={(value) => update("vPhone", value)} />
          <InputField label="Email" value={form.vEmail} type="email" onChange={(value) => update("vEmail", value)} />
        </>
      );
    case "whatsapp":
      return (
        <>
          <InputField label="WhatsApp number" value={form.whatsapp} onChange={(value) => update("whatsapp", value)} placeholder="+234..." />
          <TextareaField label="Message" value={form.whatsappMessage} onChange={(value) => update("whatsappMessage", value)} />
        </>
      );
    case "wifi":
      return (
        <>
          <InputField label="Network name (SSID)" value={form.wifiSsid} onChange={(value) => update("wifiSsid", value)} />
          <InputField label="Password" value={form.wifiPassword} onChange={(value) => update("wifiPassword", value)} />
          <label>
            Encryption
            <select value={form.wifiEncryption} onChange={(event) => update("wifiEncryption", event.target.value as FormState["wifiEncryption"])}>
              <option value="WPA">WPA/WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Open</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.wifiHidden} onChange={(event) => update("wifiHidden", event.target.checked)} />
            Hidden network
          </label>
        </>
      );
    case "pdf":
      return <InputField label="PDF URL" value={form.pdf} type="url" onChange={(value) => update("pdf", value)} />;
    case "app":
      return <InputField label="App URL" value={form.app} type="url" onChange={(value) => update("app", value)} />;
    case "images":
      return <InputField label="Image URL" value={form.images} type="url" onChange={(value) => update("images", value)} />;
    case "video":
      return <InputField label="Video URL" value={form.video} type="url" onChange={(value) => update("video", value)} />;
    case "social":
      return <InputField label="Profile URL" value={form.social} type="url" onChange={(value) => update("social", value)} />;
    case "event":
      return (
        <>
          <InputField label="Event title" value={form.eventTitle} onChange={(value) => update("eventTitle", value)} />
          <InputField label="Location" value={form.eventLocation} onChange={(value) => update("eventLocation", value)} />
          <InputField label="Start date" type="date" value={form.eventStart} onChange={(value) => update("eventStart", value)} />
          <InputField label="End date" type="date" value={form.eventEnd} onChange={(value) => update("eventEnd", value)} />
          <TextareaField label="Description" value={form.eventDescription} onChange={(value) => update("eventDescription", value)} />
        </>
      );
    case "barcode2d":
      return <TextareaField label="2D barcode data" value={form.barcode2d} onChange={(value) => update("barcode2d", value)} placeholder="Enter product ID, URL, or custom value" />;
    default:
      return null;
  }
}
