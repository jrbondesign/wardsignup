#!/usr/bin/env tsx
/**
 * Generate a static HTML preview of the organizer digest email using fixture data.
 * Does NOT require database access or environment variables.
 * Usage: tsx scripts/preview-email-fixture.ts
 * Output: ./email-previews/digest-fixture.html
 */

import { buildOrganizerMetricsEmailHtml } from "@/lib/organizer-email";
import { toPublicBrand, getBrandDefinition } from "@/lib/brand/brands";
import * as fs from "fs";
import * as path from "path";

// Sample fixture data matching the screenshots
const fixtureData = {
  brand: toPublicBrand(getBrandDefinition("wardsignup")),
  campaignName: "Sweetwater Branch: Thursday Evening Teaching - September",
  eventUrl: "https://wardsignup.com/event/test-123",
  adminUrl: "https://wardsignup.com/admin/test-123",
  totalCapacity: 48,
  totalSignups: 15,
  remaining: 33,
  fillPct: 31,
  sessions: [
    {
      id: "1",
      day_of_week: 3,
      time: "08:30",
      end_time: "09:30",
      session_date: "2026-09-03",
      location: "Detention Center - 1155 N Pinal Parkway Florence, AZ 85132",
      notes: null,
      label: "Women's Class",
      capacity: 2,
      signups: [],
    },
    {
      id: "2",
      day_of_week: 3,
      time: "17:30",
      end_time: "18:30",
      session_date: "2026-09-03",
      location: "Detention Center - 1155 N Pinal Parkway Florence, AZ 85132",
      notes: null,
      label: "Women's Class",
      capacity: 4,
      signups: [
        {
          member_name: "Karen Lee",
          member_email: "leefamlee@cox.net",
          member_phone: "4806880506",
          signed_up_at: "2026-09-01T17:43:00Z",
        },
        {
          member_name: "Mark Lee",
          member_email: null,
          member_phone: null,
          signed_up_at: "2026-09-01T18:18:00Z",
        },
        {
          member_name: "Karen Lee",
          member_email: "leefamlee@cox.net",
          member_phone: "4806880506",
          signed_up_at: "2026-09-01T17:00:00Z",
        },
      ],
    },
    {
      id: "3",
      day_of_week: 4,
      time: "17:30",
      end_time: "18:30",
      session_date: "2026-09-10",
      location: "Detention Center - 1155 N Pinal Parkway Florence, AZ 85132",
      notes: null,
      label: "Men's Class Lima (Idaho)",
      capacity: 4,
      signups: [
        {
          member_name: "Scott",
          member_email: null,
          member_phone: null,
          signed_up_at: "2026-09-09T07:35:00Z",
        },
      ],
    },
    {
      id: "4",
      day_of_week: 4,
      time: "17:30",
      end_time: "18:30",
      session_date: "2026-09-17",
      location: "Detention Center - 1155 N Pinal Parkway Florence, AZ 85132",
      notes: "Bring teaching materials",
      label: null, // Testing case with no label
      capacity: 5,
      signups: [],
    },
  ],
  headline: "Here is your signup summary.",
  kind: "digest" as const,
  eventTimezone: "America/Phoenix",
};

async function main() {
  const html = buildOrganizerMetricsEmailHtml(fixtureData);

  const outputDir = path.join(process.cwd(), "email-previews");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filepath = path.join(outputDir, "digest-fixture.html");
  fs.writeFileSync(filepath, html, "utf-8");

  console.log(`✅ Fixture preview generated: ${filepath}`);
  console.log(`   Open this file in your browser to see the email preview`);
  console.log(`   Features demonstrated:`);
  console.log(`   - Past events filtered out (Sep 3 won't show if run after that date)`);
  console.log(`   - Event titles shown (e.g. "Morning Session - English Class")`);
  console.log(`   - Slots without labels still work (Sep 17 slot)`);
  console.log(`\n⚠️  NO EMAILS WERE SENT - this is a preview file only`);
}

main().catch(console.error);
