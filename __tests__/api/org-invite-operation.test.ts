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

function leaseRpc(name: string, args?: { p_token?: string | null }) {
  if (name === "email_operation_acquire") return { data: "go", error: null };
  if (name === "email_operation_recall") return { data: savedToken, error: null };
  if (name === "email_operation_remember") {
    savedToken = args?.p_token ?? null;
    return { data: true, error: null };
  }
  return { data: true, error: null };
}

beforeEach(() => {
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
  savedToken = null;
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
