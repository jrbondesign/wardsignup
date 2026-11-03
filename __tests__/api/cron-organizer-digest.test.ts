/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/organizer-email", () => ({
  sendOrganizerMetricsEmail: jest.fn(),
}));

jest.mock("@/lib/digest-recipients", () => ({
  campaignNeedsDigest: jest.fn(),
  leaderDigestRecipient: jest.fn((c: { leader_email?: string | null }, organizerEmail: string | null) => {
    const leader = (c.leader_email ?? "").trim().toLowerCase();
    if (!leader || leader === (organizerEmail ?? "").trim().toLowerCase()) return null;
    return leader;
  }),
}));

jest.mock("@/lib/rate-limit", () => ({
  claimCronRun: jest.fn(),
  dayBucketDate: jest.fn(() => new Date("2026-10-18T00:00:00.000Z")),
}));

jest.mock("@/lib/feedback-ask", () => ({
  runFeedbackAskPass: jest.fn(),
}));

jest.mock("@/lib/cron-brand", () => ({
  resolveCronBrandId: jest.fn(() => "wardsignup"),
}));

import { GET } from "@/app/api/cron/organizer-digest/route";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { campaignNeedsDigest } from "@/lib/digest-recipients";
import { claimCronRun } from "@/lib/rate-limit";
import { runFeedbackAskPass } from "@/lib/feedback-ask";
import {
  createFakeAdmin,
  cronRequest,
  eqValue,
  hasOp,
  type QueryRecord,
  type QueryResult,
} from "./cron-test-helpers";

const mockCreateClient = createServiceRoleClient as jest.MockedFunction<
  typeof createServiceRoleClient
>;
const mockSend = sendOrganizerMetricsEmail as jest.MockedFunction<typeof sendOrganizerMetricsEmail>;
const mockNeeds = campaignNeedsDigest as jest.MockedFunction<typeof campaignNeedsDigest>;
const mockClaim = claimCronRun as jest.MockedFunction<typeof claimCronRun>;
const mockFeedback = runFeedbackAskPass as jest.MockedFunction<typeof runFeedbackAskPass>;

const PATH = "/api/cron/organizer-digest";
const SECRET = "test-cron-secret";
const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();
const FEEDBACK = { ok: true } as unknown as Awaited<ReturnType<typeof runFeedbackAskPass>>;

type CampaignRow = {
  id: string;
  user_email: string | null;
  organizer_digest_enabled: boolean | null;
  organizer_last_digest_sent_at: string | null;
  leader_email: string | null;
};

function campaign(id: string, extra: Partial<CampaignRow> = {}): CampaignRow {
  return {
    id,
    user_email: `org-${id}@example.com`,
    organizer_digest_enabled: true,
    organizer_last_digest_sent_at: null,
    leader_email: null,
    ...extra,
  };
}

function setup(opts: {
  campaigns?: CampaignRow[];
  listError?: { message: string };
  sessions?: Array<{ campaign_id: string; session_date: string | null }>;
}) {
  const resolve = (q: QueryRecord): QueryResult => {
    if (q.table === "sessions") return { data: opts.sessions ?? [], error: null };
    if (q.table === "campaigns" && !hasOp(q, "update")) {
      return { data: opts.campaigns ?? [], error: opts.listError ?? null };
    }
    return { data: null, error: null };
  };
  const fake = createFakeAdmin(resolve);
  mockCreateClient.mockReturnValue(fake.admin as unknown as ReturnType<typeof createServiceRoleClient>);
  return fake;
}

function stampedIds(queries: QueryRecord[]) {
  return queries
    .filter((q) => q.table === "campaigns" && hasOp(q, "update"))
    .map((q) => eqValue(q, "id"));
}

describe("/api/cron/organizer-digest", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    mockClaim.mockResolvedValue({ claimed: true });
    mockFeedback.mockResolvedValue(FEEDBACK);
    mockNeeds.mockResolvedValue(true);
    mockSend.mockImplementation(async (_admin, _id, _kind, opts) => ({ ok: true, sentTo: opts?.to }));
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await GET(cronRequest(PATH));
    expect(res.status).toBe(401);
    expect(mockFeedback).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const res = await GET(cronRequest(PATH, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("refuses (500) when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest(PATH, ""));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CRON_SECRET is not configured" });
    expect(mockFeedback).not.toHaveBeenCalled();
  });

  it("still runs the feedback pass but skips digests when the day claim is taken", async () => {
    mockClaim.mockResolvedValue({ claimed: false });
    setup({ campaigns: [campaign("c1")] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body).toEqual({
      ok: true,
      brandId: "wardsignup",
      skipped: "already_ran_today",
      feedbackAsk: FEEDBACK,
    });
    expect(mockFeedback).toHaveBeenCalledTimes(1);
    expect(mockClaim).toHaveBeenCalledWith("organizer-digest:wardsignup", expect.any(Date));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("keeps going when the feedback pass throws", async () => {
    mockFeedback.mockRejectedValue(new Error("feedback down"));
    setup({ campaigns: [] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body.ok).toBe(true);
    expect(body.feedbackAsk).toEqual({ error: "feedback down" });
  });

  it("returns 500 (with feedback result) when listing campaigns fails", async () => {
    setup({ listError: { message: "boom" } });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "Failed to list campaigns", feedbackAsk: FEEDBACK });
  });

  it("sends digests for live campaigns and stamps organizer_last_digest_sent_at", async () => {
    const { queries } = setup({
      campaigns: [campaign("live"), campaign("recurring"), campaign("graceEdge"), campaign("past")],
      sessions: [
        { campaign_id: "live", session_date: "2026-10-25" },
        { campaign_id: "recurring", session_date: null },
        // 2-day grace: today 2026-10-18 => cutoff 2026-10-16 inclusive
        { campaign_id: "graceEdge", session_date: "2026-10-16" },
        { campaign_id: "past", session_date: "2026-10-15" },
      ],
    });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body).toMatchObject({ ok: true, sent: 3, skipped: 1 });
    expect(mockSend.mock.calls.map((c) => c[1])).toEqual(["live", "recurring", "graceEdge"]);
    expect(mockSend).toHaveBeenCalledWith(expect.anything(), "live", "digest");
    expect(stampedIds(queries)).toEqual(["live", "recurring", "graceEdge"]);

    const list = queries.find((q) => q.table === "campaigns" && !hasOp(q, "update"))!;
    expect(list.ops).toContainEqual({ method: "eq", args: ["brand_id", "wardsignup"] });
  });

  it("skips campaigns with nothing new and does not stamp them", async () => {
    mockNeeds.mockResolvedValue(false);
    const { queries } = setup({
      campaigns: [campaign("c1")],
      sessions: [{ campaign_id: "c1", session_date: "2026-10-25" }],
    });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body).toMatchObject({ sent: 0, skipped: 1 });
    expect(mockSend).not.toHaveBeenCalled();
    expect(stampedIds(queries)).toEqual([]);
  });

  it("emails each organizer inbox at most once per run", async () => {
    setup({
      campaigns: [
        campaign("c1", { user_email: "Same@Example.com" }),
        campaign("c2", { user_email: "same@example.com" }),
      ],
      sessions: [
        { campaign_id: "c1", session_date: "2026-10-25" },
        { campaign_id: "c2", session_date: "2026-10-25" },
      ],
    });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ sent: 1, skipped: 1 });
  });

  it("sends the leader digest even when the organizer opted out", async () => {
    const { queries } = setup({
      campaigns: [campaign("c1", { organizer_digest_enabled: false, leader_email: "Leader@Example.com" })],
      sessions: [{ campaign_id: "c1", session_date: "2026-10-25" }],
    });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.anything(), "c1", "digest", { to: "leader@example.com" });
    expect(body.sent).toBe(1);
    expect(stampedIds(queries)).toEqual(["c1"]);
  });

  it("does not stamp when every send fails, and reports errors", async () => {
    mockSend.mockResolvedValue({ ok: false, error: "resend 500" });
    const { queries } = setup({
      campaigns: [campaign("c1")],
      sessions: [{ campaign_id: "c1", session_date: "2026-10-25" }],
    });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body.errors).toEqual(["c1: resend 500"]);
    expect(stampedIds(queries)).toEqual([]);
  });
});
