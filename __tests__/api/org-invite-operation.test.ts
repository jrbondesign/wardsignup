/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/organizations/[id]/members/route";
import { getAuthFromRequest } from "@/lib/auth";
import { sendGuardedEmail } from "@/lib/email-send";
import { cutoverBlocksNewLogin } from "@/lib/email-cutover";
import { createServiceRoleClient } from "@/lib/supabase-admin";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/email-deliver", () => ({ hasEmailProviderConfigured: () => true }));
jest.mock("@/lib/email-send", () => ({ sendGuardedEmail: jest.fn() }));
jest.mock("@/lib/email-cutover", () => ({ cutoverBlocksNewLogin: jest.fn() }));
jest.mock("@/lib/site-footer", () => ({ buildBrandSignatureFooterHtml: () => "" }));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: jest.fn() }));

const ORG = "11111111-2222-4333-8444-555555555555";
const OWNER = "c0000000-0000-4000-8000-000000000002";
const rpc = jest.fn();

type Member = {
  invite_last_sent_at: string | null;
  accept_token: string | null;
  accept_token_hash: string | null;
};

let savedToken: string | null = null;
let reissueBlocked = false;
let parked = false;

function harness() {
  const state: { member: Member | null; upserts: Array<Record<string, unknown>> } = {
    member: null,
    upserts: [],
  };
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.upsert = (values: Record<string, unknown>) => {
        state.upserts.push(values);
        state.member = {
          invite_last_sent_at: state.member?.invite_last_sent_at ?? null,
          accept_token: (values.accept_token as string | null) ?? null,
          accept_token_hash: (values.accept_token_hash as string | null) ?? null,
        };
        return chain;
      };
      chain.update = (values: Record<string, unknown>) => {
        if (state.member) {
          if ("invite_last_sent_at" in values) {
            state.member.invite_last_sent_at = values.invite_last_sent_at as string;
          }
          if ("accept_token" in values) state.member.accept_token = values.accept_token as string | null;
        }
        return chain;
      };
      chain.maybeSingle = async () => {
        if (table === "organizations") {
          return {
            data: { id: ORG, name: "Test Ward", brand_id: "wardsignup", owner_id: OWNER },
            error: null,
          };
        }
        return { data: state.member, error: null };
      };
      chain.single = async () => ({
        data: { id: "m1", invited_email: "bishop@example.com", role: "admin", status: "pending" },
        error: null,
      });
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null });
      return chain;
    },
  };
  return { state, supabase };
}

function req() {
  return new NextRequest(`https://wardsignup.com/api/organizations/${ORG}/members`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "wardsignup.com" },
    body: JSON.stringify({ email: "Bishop@Example.com" }),
  });
}

const params = { params: Promise.resolve({ id: ORG }) };

function leaseRpc(name: string, args?: { p_token?: string | null; p_state?: string }) {
  if (name === "email_operation_acquire") {
    if (parked) return { data: "queued", error: null };
    return { data: reissueBlocked ? "blocked" : "go", error: null };
  }
  if (name === "email_operation_mark_queued") {
    parked = true;
    return { data: true, error: null };
  }
  if (name === "email_operation_recall") return { data: savedToken, error: null };
  if (name === "email_operation_remember") {
    if (!args?.p_token) return { data: false, error: null };
    savedToken = args.p_token;
    return { data: true, error: null };
  }
  if (name === "email_operation_finish") {
    if (args?.p_state === "ambiguous") {
      savedToken = null;
      reissueBlocked = true;
    } else if (args?.p_state === "accepted" || args?.p_state === "terminal" || args?.p_state === "settled") {
      savedToken = null;
      reissueBlocked = false;
    }
    return { data: true, error: null };
  }
  return { data: true, error: null };
}

beforeEach(() => {
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
  savedToken = null;
  reissueBlocked = false;
  parked = false;
  rpc.mockReset();
  rpc.mockImplementation(async (name: string, args?: { p_token?: string | null }) => leaseRpc(name, args));
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
  (cutoverBlocksNewLogin as jest.Mock).mockReset();
  (cutoverBlocksNewLogin as jest.Mock).mockResolvedValue(false);
  (sendGuardedEmail as jest.Mock).mockReset();
  (sendGuardedEmail as jest.Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete process.env.EMAIL_PROVIDER_CUTOVER;
});

function keys(): string[] {
  return (sendGuardedEmail as jest.Mock).mock.calls.map((call) => call[0].idempotencyKey as string);
}

it("does not replace a token after an ambiguous send", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: false, error: "timed out", ambiguous: true });
  const first = await POST(req(), params);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ ok: true, delivery: "unconfirmed" });
  expect(state.upserts[0].accept_token).toBeNull();
  expect(savedToken).toBeNull();
  expect(state.member?.invite_last_sent_at).toBeTruthy();
  const hash = state.member?.accept_token_hash;
  const cooled = await POST(req(), params);
  expect(cooled.status).toBe(429);
  expect(sendGuardedEmail).toHaveBeenCalledTimes(1);
  expect(state.upserts).toHaveLength(1);
  expect(state.member?.accept_token_hash).toBe(hash);

  state.member!.invite_last_sent_at = null;
  (cutoverBlocksNewLogin as jest.Mock).mockResolvedValue(true);
  const uncertain = await POST(req(), params);
  expect(uncertain.status).toBe(200);
  expect(await uncertain.json()).toEqual({ ok: true, delivery: "unconfirmed" });
  expect(sendGuardedEmail).toHaveBeenCalledTimes(1);
  expect(state.upserts).toHaveLength(1);
  expect(keys()[0]).toMatch(/^org_member_invite\//);
  const rememberClears = rpc.mock.calls.filter(
    (call) => call[0] === "email_operation_remember" && !(call[1] as { p_token?: string } | undefined)?.p_token,
  );
  expect(rememberClears).toHaveLength(0);
  expect(rpc.mock.calls.filter((call) => call[0] === "email_operation_finish").map((call) => (call[1] as { p_state: string }).p_state)).toEqual([
    "ambiguous",
  ]);
});

it("does not mint after an ambiguous finish once the cooldown and uncertainty have expired", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: false, error: "timed out", ambiguous: true });
  const first = await POST(req(), params);
  expect(first.status).toBe(200);
  const hash = state.member?.accept_token_hash;
  state.member!.invite_last_sent_at = null;
  (cutoverBlocksNewLogin as jest.Mock).mockResolvedValue(false);
  const later = await POST(req(), params);
  expect(later.status).toBe(200);
  expect(await later.json()).toEqual({ ok: true, delivery: "unconfirmed" });
  expect(sendGuardedEmail).toHaveBeenCalledTimes(1);
  expect(state.upserts).toHaveLength(1);
  expect(state.member?.accept_token_hash).toBe(hash);
});

it("reports a queued invite as queued and does not mint a second link", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({
    ok: false,
    error: "Brevo rate limited",
    retryable: true,
    queued: true,
  });
  const res = await POST(req(), params);
  expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({ ok: true, delivery: "queued" });
  expect(rpc.mock.calls.filter((call) => call[0] === "email_operation_finish")).toHaveLength(0);
  expect(rpc.mock.calls.filter((call) => call[0] === "email_operation_mark_queued")).toHaveLength(1);
  expect(state.member?.invite_last_sent_at ?? null).toBeNull();
  expect(state.upserts).toHaveLength(1);
  const again = await POST(req(), params);
  expect(again.status).toBe(202);
  expect(sendGuardedEmail).toHaveBeenCalledTimes(1);
  expect(state.upserts).toHaveLength(1);
});

it("waits out the hour after the queued copy is accepted, then mints one new link", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({
    ok: false,
    error: "Brevo rate limited",
    retryable: true,
    queued: true,
  });
  const queued = await POST(req(), params);
  expect(queued.status).toBe(202);
  const firstHash = state.upserts[0]?.accept_token_hash;
  parked = false;
  savedToken = null;
  state.member = {
    invite_last_sent_at: new Date().toISOString(),
    accept_token: null,
    accept_token_hash: firstHash as string,
  };
  const cooling = await POST(req(), params);
  expect(cooling.status).toBe(429);
  expect(sendGuardedEmail).toHaveBeenCalledTimes(1);
  state.member.invite_last_sent_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: true });
  const reissue = await POST(req(), params);
  expect(reissue.status).toBe(201);
  expect(sendGuardedEmail).toHaveBeenCalledTimes(2);
  expect(state.upserts).toHaveLength(2);
  expect(state.upserts[1]?.accept_token_hash).not.toBe(firstHash);
});

it("reuses the same token when the send is retryable and mints a new one after a settled cooldown", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: false, error: "down", retryable: true });
  const failed = await POST(req(), params);
  expect(failed.status).toBe(503);
  const token = savedToken;
  expect(token).toEqual(expect.any(String));
  expect(state.upserts[0].accept_token).toBeNull();
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: true });
  const replay = await POST(req(), params);
  expect(replay.status).toBe(201);
  expect(savedToken).toBeNull();
  expect(state.upserts[1].accept_token).toBeNull();
  expect(state.upserts[1].accept_token_hash).toBe(state.upserts[0].accept_token_hash);
  expect(keys()[1]).toBe(keys()[0]);

  state.member!.invite_last_sent_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: true });
  const reissue = await POST(req(), params);
  expect(reissue.status).toBe(201);
  expect(state.upserts[2].accept_token_hash).not.toBe(state.upserts[0].accept_token_hash);
  expect(keys()[2]).not.toBe(keys()[0]);
  expect(token).not.toBe(savedToken);
});

it("does not write a second token while another request holds the lease", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  rpc.mockResolvedValueOnce({ data: "busy", error: null });
  const res = await POST(req(), params);
  expect(res.status).toBe(409);
  expect(state.upserts).toHaveLength(0);
  expect(sendGuardedEmail).not.toHaveBeenCalled();
});

it("does not email when the stored token cannot be marked for HTTP", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  const events: string[] = [];
  rpc.mockImplementation(async (name: string, args?: { p_token?: string | null; p_state?: string }) => {
    events.push(name);
    if (name === "email_operation_mark_http") return { data: false, error: null };
    return leaseRpc(name, args);
  });
  const res = await POST(req(), params);
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: expect.any(String), retryable: true });
  expect(sendGuardedEmail).not.toHaveBeenCalled();
  expect(savedToken).toEqual(expect.any(String));
  expect(events).toContain("email_operation_mark_http");
  expect(events.indexOf("email_operation_remember")).toBeLessThan(events.indexOf("email_operation_mark_http"));
  expect(rpc.mock.calls.filter((call) => call[0] === "email_operation_finish").map((call) => (call[1] as { p_state: string }).p_state)).toEqual([
    "failed",
  ]);
  expect(state.upserts).toHaveLength(1);
});

it("marks HTTP only after the token is stored and before the provider call", async () => {
  const { supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  const events: string[] = [];
  rpc.mockImplementation(async (name: string, args?: { p_token?: string | null; p_state?: string }) => {
    events.push(name);
    return leaseRpc(name, args);
  });
  (sendGuardedEmail as jest.Mock).mockImplementation(async () => {
    events.push("send");
    return { ok: true };
  });
  const res = await POST(req(), params);
  expect(res.status).toBe(201);
  expect(events.indexOf("email_operation_remember")).toBeLessThan(events.indexOf("email_operation_mark_http"));
  expect(events.indexOf("email_operation_mark_http")).toBeLessThan(events.indexOf("send"));
});

it("does not write when the lease function is missing", async () => {
  const { state, supabase } = harness();
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase,
    user: { id: OWNER, email: "owner@example.com" },
  });
  rpc.mockResolvedValueOnce({ data: null, error: { message: "email_operation_acquire does not exist" } });
  const res = await POST(req(), params);
  expect(res.status).toBe(503);
  expect(state.upserts).toHaveLength(0);
  expect(sendGuardedEmail).not.toHaveBeenCalled();
});
