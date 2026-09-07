import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getBrandFromHost } from "@/lib/brand";

/**
 * POST /api/auth/create-mcp-token
 * Generates a long-lived API key for MCP (Claude Desktop) access.
 * Returns the token once — it is not retrievable after this call.
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { user } = auth;

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);

    const { createHash, randomBytes } = await import("crypto");

    // Generate a random token: "wsu_live_" + 32 hex bytes
    const rawToken = `wsu_live_${randomBytes(32).toString("hex")}`;
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const admin = createServiceRoleClient();

    // Revoke any existing tokens for this user+brand (one active token per account)
    await admin
      .from("mcp_tokens" as never)
      .delete()
      .eq("user_id", user.id)
      .eq("brand_id", brand.id);

    // Insert new token
    const { error: insertError } = await admin
      .from("mcp_tokens" as never)
      .insert({
        user_id: user.id,
        brand_id: brand.id,
        token_hash: tokenHash,
        created_at: new Date().toISOString(),
      } as never);

    if (insertError) {
      console.error("[create-mcp-token] insert error:", insertError);
      return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
    }

    const apiUrl = brand.siteUrl;
    const brandId = brand.id;

    const claudeConfig = {
      mcpServers: {
        [brandId]: {
          command: "npx",
          args: ["-y", `${brandId}-mcp`],
          env: {
            WARDSIGNUP_API_URL: apiUrl,
            WARDSIGNUP_API_KEY: rawToken,
            WARDSIGNUP_BRAND_ID: brandId,
          },
        },
      },
    };

    return NextResponse.json({
      token: rawToken,
      claudeConfig,
      instructions: [
        `Add the "mcpServers" block to your Claude Desktop config at:`,
        `  macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json`,
        `  Windows: %APPDATA%\\Claude\\claude_desktop_config.json`,
        `Then restart Claude Desktop.`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[create-mcp-token] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE /api/auth/create-mcp-token — revoke the current MCP token */
export async function DELETE(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { user } = auth;

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);

    const admin = createServiceRoleClient();
    await admin
      .from("mcp_tokens" as never)
      .delete()
      .eq("user_id", user.id)
      .eq("brand_id", brand.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[create-mcp-token DELETE] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
