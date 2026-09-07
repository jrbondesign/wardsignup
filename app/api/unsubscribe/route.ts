import { NextRequest, NextResponse } from "next/server";
import {
  suppressEmail,
  verifyUnsubscribeSignature,
} from "@/lib/email-send";
import { consumeActionRate } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe (RFC 8058). Linked from the List-Unsubscribe header on
 * every notification email. GET shows a confirmation page (some scanners
 * prefetch GETs, so GET does not unsubscribe by itself); POST (one-click and
 * the page button) performs it. The e/sig pair is an HMAC over the address, so
 * only links we generated can suppress an address.
 */

function parseParams(request: NextRequest): { emailLower: string } | null {
  const e = request.nextUrl.searchParams.get("e") ?? "";
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  if (!e || !sig) return null;
  let emailLower: string;
  try {
    emailLower = Buffer.from(e, "base64url").toString("utf8").toLowerCase();
  } catch {
    return null;
  }
  if (!emailLower.includes("@") || emailLower.length > 320) return null;
  if (!verifyUnsubscribeSignature(emailLower, sig)) return null;
  return { emailLower };
}

export async function GET(request: NextRequest) {
  const parsed = parseParams(request);
  if (!parsed) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }
  const qs = request.nextUrl.searchParams.toString();
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Unsubscribe</title></head>
     <body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; color: #111;">
       <h1 style="font-size: 20px;">Unsubscribe from notification emails?</h1>
       <p style="color: #444;">You'll stop receiving summaries, reminders, and other notification emails at this address. Sign-in links still work.</p>
       <form method="POST" action="/api/unsubscribe?${qs}">
         <button type="submit" style="background: #0e7490; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 15px; cursor: pointer;">Unsubscribe</button>
       </form>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: NextRequest) {
  const rate = await consumeActionRate("unsubscribe", request, 30);
  if (!rate.allowed) {
    return new NextResponse("Too many requests.", { status: 429 });
  }
  const parsed = parseParams(request);
  if (!parsed) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }
  const ok = await suppressEmail(parsed.emailLower, "unsubscribe", "one-click");
  if (!ok) {
    return new NextResponse("Could not process unsubscribe. Please try again.", {
      status: 500,
    });
  }
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Unsubscribed</title></head>
     <body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; color: #111;">
       <h1 style="font-size: 20px;">You're unsubscribed</h1>
       <p style="color: #444;">This address won't receive notification emails anymore. Sign-in links still work if you ever need them.</p>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
