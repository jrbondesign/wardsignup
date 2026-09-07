import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  const font = readFileSync(join(process.cwd(), "public/fonts/DMSerifDisplay-Regular.ttf"));
  const logoPath = join(process.cwd(), "public", brand.logoSrc.replace(/^\//, ""));
  const logoBuffer = readFileSync(logoPath);

  const logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  const title = brand.shortName;
  const tagline = brand.twitterDescription;

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
          background: "linear-gradient(135deg, #0E96B0 0%, #08647E 100%)",
          padding: "80px",
        }}
      >
        {/* Logo */}
        <img
          src={logoBase64}
          width={120}
          height={120}
          style={{ objectFit: "contain", marginBottom: 36, borderRadius: 16 }}
        />

        {/* Title */}
        <div
          style={{
            fontFamily: "DM Serif Display",
            fontSize: title.length > 18 ? 64 : 80,
            color: "white",
            marginBottom: 20,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: tagline.length > 80 ? 24 : 30,
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            maxWidth: 680,
            lineHeight: 1.5,
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "DM Serif Display", data: font.buffer, style: "normal" }],
    }
  );
}
