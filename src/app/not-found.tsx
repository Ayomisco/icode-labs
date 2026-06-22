import Link from "next/link";
import NextImage from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "404 — Page not found | icode" };

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Manrope, sans-serif",
        padding: "24px",
        gap: "24px",
        textAlign: "center",
      }}
    >
      <NextImage src="/icode-logo.svg" alt="icode" width={48} height={48} />

      <div>
        <p
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: "5rem",
            fontWeight: 700,
            color: "#e0e8f4",
            lineHeight: 1,
            margin: "0 0 8px",
          }}
        >
          404
        </p>
        <h1
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: "1.6rem",
            fontWeight: 700,
            color: "#10192f",
            margin: "0 0 10px",
          }}
        >
          Page not found
        </h1>
        <p style={{ color: "#4d5f87", maxWidth: "360px", lineHeight: 1.55 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/"
          style={{
            background: "#1f5edb",
            color: "#fff",
            padding: "12px 22px",
            borderRadius: "11px",
            fontWeight: 700,
            fontSize: "0.95rem",
            textDecoration: "none",
          }}
        >
          Go to QR Builder
        </Link>
        <Link
          href="/dashboard"
          style={{
            background: "#fff",
            color: "#10192f",
            padding: "12px 22px",
            borderRadius: "11px",
            fontWeight: 600,
            fontSize: "0.95rem",
            border: "1px solid #d8deec",
            textDecoration: "none",
          }}
        >
          My Dashboard
        </Link>
      </div>
    </div>
  );
}
