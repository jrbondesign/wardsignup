import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  extractEventFromDescription,
  computeMissingFields,
} from "@/lib/ai-event-extraction";
import type { BrandId } from "@/lib/brand/types";
import { getPostHogClient } from "@/lib/posthog-server";

const VALID_BRAND_IDS: BrandId[] = ["wardsignup", "ministrysignup", "orgsignup"];

// Simple in-process rate limiter: max 10 requests per user per hour.
// Resets on cold start (acceptable for Hobby plan single instances).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export async function POST(request: Request) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  // Rate limit by user ID
  const { allowed, retryAfterMs } = checkRateLimit(auth.user.id);
  if (!allowed) {
    const retryAfterSecs = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
      { error: "Too many AI requests. Please wait a bit and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSecs) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { description, brandId } = body as { description?: unknown; brandId?: unknown };

  if (typeof description !== "string" || description.trim().length < 10) {
    return NextResponse.json(
      { error: "Description must be at least 10 characters." },
      { status: 400 },
    );
  }
  if (description.trim().length > 500) {
    return NextResponse.json(
      { error: "Description must be 500 characters or fewer." },
      { status: 400 },
    );
  }

  const safeBrandId: BrandId = VALID_BRAND_IDS.includes(brandId as BrandId)
    ? (brandId as BrandId)
    : "wardsignup";

  try {
    const result = await extractEventFromDescription(description.trim(), safeBrandId);
    const missingFields = computeMissingFields(result);

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: auth.user.id,
      event: "ai_event_generated",
      properties: {
        brand_id: safeBrandId,
        description_length: description.trim().length,
        missing_fields_count: missingFields.length,
        template_type: result.templateType,
      },
    });

    return NextResponse.json({ result, missingFields });
  } catch (err) {
    console.error("[ai-create-event] extraction failed:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
