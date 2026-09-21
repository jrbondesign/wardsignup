#!/usr/bin/env tsx
/**
 * Generate HTML preview of organizer digest emails WITHOUT sending real emails.
 * Usage: tsx scripts/preview-organizer-email.ts [campaignId]
 * 
 * If no campaignId is provided, generates previews for all campaigns with digest enabled.
 * Output: ./email-previews/*.html files
 */

import { createServiceRoleClient } from "@/lib/supabase-admin";
import { buildOrganizerMetricsEmailHtml } from "@/lib/organizer-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import * as fs from "fs";
import * as path from "path";

type SessionRow = {
  id: string;
  day_of_week: number;
  time: string;
  end_time: string | null;
  session_date: string | null;
  location: string | null;
  notes: string | null;
  label: string | null;
  capacity: number;
  signups: Array<{
    member_name: string;
    member_email: string | null;
    member_phone: string | null;
    signed_up_at: string | null;
  }> | null;
};

async function previewCampaign(campaignId: string) {
  const admin = createServiceRoleClient();

  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    console.error(`Campaign ${campaignId} not found`);
    return;
  }

  const c = campaign as Record<string, unknown>;
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
    brand_id: c.brand_id as string | null | undefined,
    public_host: c.public_host as string | null | undefined,
  });

  const { data: sessionRows, error: sErr } = await admin
    .from("sessions")
    .select("*, signups(*)")
    .eq("campaign_id", campaignId)
    .order("day_of_week", { ascending: true })
    .order("time", { ascending: true });

  if (sErr) {
    console.error(`Error fetching sessions for ${campaignId}:`, sErr.message);
    return;
  }

  const sessions = (sessionRows || []) as unknown as SessionRow[];
  const totalCapacity = sessions.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const totalSignups = sessions.reduce(
    (sum, s) => sum + (Array.isArray(s.signups) ? s.signups.length : 0),
    0,
  );
  const remaining = Math.max(0, totalCapacity - totalSignups);
  const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;

  const name = String(c.name ?? "Event");
  const eventUrl = `${siteOrigin}/event/${campaignId}`;
  const adminUrl = `${siteOrigin}/admin/${campaignId}`;

  const html = buildOrganizerMetricsEmailHtml({
    brand,
    campaignName: name,
    eventUrl,
    adminUrl,
    totalCapacity,
    totalSignups,
    remaining,
    fillPct,
    sessions,
    headline: "Here is your signup summary.",
    kind: "digest",
    eventTimezone: (c.event_timezone as string | null) ?? null,
  });

  const outputDir = path.join(process.cwd(), "email-previews");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `digest-${campaignId}-${timestamp}.html`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, html, "utf-8");
  console.log(`✅ Preview generated: ${filepath}`);
  console.log(`   Campaign: ${name}`);
  console.log(`   Sessions: ${sessions.length} (${sessions.filter(s => s.session_date).length} dated, ${sessions.filter(s => !s.session_date).length} recurring)`);
  console.log(`   Signups: ${totalSignups}/${totalCapacity}`);
}

async function main() {
  const campaignId = process.argv[2];

  if (campaignId) {
    await previewCampaign(campaignId);
  } else {
    console.log("Generating previews for all campaigns with digest enabled...\n");
    const admin = createServiceRoleClient();
    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id, name")
      .eq("organizer_digest_enabled", true)
      .limit(10);

    if (!campaigns || campaigns.length === 0) {
      console.log("No campaigns found with digest enabled.");
      return;
    }

    for (const c of campaigns as Array<{ id: string; name: string }>) {
      await previewCampaign(c.id);
    }
  }

  console.log("\n🎉 All previews generated in ./email-previews/");
  console.log("⚠️  NO EMAILS WERE SENT - these are preview files only");
}

main().catch(console.error);
