import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";
import { getPublicCampaignById } from "@/lib/supabase";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function EventOGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  const font = readFileSync(join(process.cwd(), "public/fonts/DMSerifDisplay-Regular.ttf"));
  const logoPath = join(process.cwd(), "public", brand.logoSrc.replace(/^\//, ""));
  const logoBuffer = readFileSync(logoPath);

  const { data: pubRows } = await getPublicCampaignById(id);
  const rows = Array.isArray(pubRows) ? pubRows : pubRows ? [pubRows] : [];
  const event = rows[0] as {
    name?: string;
    description?: string | null;
    cover_image_url?: string | null;
  } | undefined;

  const logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  const eventName = event?.name ?? brand.shortName;
  const eventDescription = event?.description ?? null;

  // Fetch cover image for Ministry brand (fall back to gradient if unavailable)
  const isMinistry = brand.id === "ministrysignup";
  let coverBase64: string | null = null;
  if (isMinistry && event?.cover_image_url) {
    try {
      const res = await fetch(event.cover_image_url, { cache: "force-cache" });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const mime = res.headers.get("content-type") ?? "image/jpeg";
        coverBase64 = `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
      }
    } catch {
      // Fall through to gradient
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: coverBase64 ? "transparent" : "linear-gradient(135deg, #0E96B0 0%, #08647E 100%)",
          padding: "80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Cover image background */}
        {coverBase64 && (
          <img
            src={coverBase64}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        {/* Dark overlay for legibility over cover photo */}
        {coverBase64 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.60))",
            }}
          />
        )}

        {/* Logo */}
        <img
          src={logoBase64}
          width={90}
          height={90}
          style={{ objectFit: "contain", marginBottom: 32, borderRadius: 12, position: "relative" }}
        />

        {/* Event name */}
        <div
          style={{
            fontFamily: "DM Serif Display",
            fontSize: eventName.length > 30 ? 56 : 72,
            color: "white",
            marginBottom: coverBase64 || !eventDescription ? 20 : 12,
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: 900,
            position: "relative",
          }}
        >
          {eventName}
        </div>

        {/* Description — only shown on gradient background (no cover photo) */}
        {!coverBase64 && eventDescription && (
          <div
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.75)",
              textAlign: "center",
              lineHeight: 1.45,
              maxWidth: 820,
              marginBottom: 20,
              position: "relative",
            }}
          >
            {eventDescription.length > 120
              ? eventDescription.slice(0, 120) + "…"
              : eventDescription}
          </div>
        )}

        {/* Site host */}
        <div
          style={{
            fontSize: 26,
            color: "rgba(255,255,255,0.6)",
            textAlign: "center",
            letterSpacing: "0.5px",
            position: "relative",
          }}
        >
          {brand.siteHost}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "DM Serif Display", data: font.buffer, style: "normal" }],
    }
  );
}
