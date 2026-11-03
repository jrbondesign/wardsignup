import { acceptInviteWithCalling } from "@/lib/invite-accept";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Record<string, { status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[url];
    if (r instanceof Error) throw r;
    if (!r) throw new Error(`unexpected ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const ACCEPTED = { status: 200, body: { organization_id: "org-1", destination: "/dashboard" } };

describe("acceptInviteWithCalling", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("accepts, then saves the calling to the accepting user's profile", async () => {
    const { impl, calls } = fakeFetch({
      "/api/organizations/accept": ACCEPTED,
      "/api/organizer-profile/calling": { status: 200, body: { calling: "Ward clerk" } },
    });
    const res = await acceptInviteWithCalling({ token: "tok", accessToken: "jwt", calling: "Ward clerk", fetchImpl: impl });
    expect(res).toEqual({ ok: true, data: ACCEPTED.body, callingSaved: true });
    expect(calls.map((c) => c.url)).toEqual(["/api/organizations/accept", "/api/organizer-profile/calling"]);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ token: "tok" });
    expect(calls[1].init.method).toBe("PATCH");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ calling: "Ward clerk" });
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
  });

  it("accepts with the calling left blank and never calls the calling API", async () => {
    const { impl, calls } = fakeFetch({ "/api/organizations/accept": ACCEPTED });
    const res = await acceptInviteWithCalling({ token: "tok", accessToken: "jwt", calling: null, fetchImpl: impl });
    expect(res).toEqual({ ok: true, data: ACCEPTED.body, callingSaved: false });
    expect(calls).toHaveLength(1);
  });

  it("still completes the accept when the calling save returns 409 before the migration", async () => {
    const { impl } = fakeFetch({
      "/api/organizations/accept": ACCEPTED,
      "/api/organizer-profile/calling": { status: 409, body: { code: "calling_unavailable" } },
    });
    const res = await acceptInviteWithCalling({ token: "tok", accessToken: "jwt", calling: "Bishop", fetchImpl: impl });
    expect(res).toEqual({ ok: true, data: ACCEPTED.body, callingSaved: false });
  });

  it("still completes the accept when the calling save throws", async () => {
    const { impl } = fakeFetch({
      "/api/organizations/accept": ACCEPTED,
      "/api/organizer-profile/calling": new Error("network down"),
    });
    const res = await acceptInviteWithCalling({ token: "tok", accessToken: "jwt", calling: "Bishop", fetchImpl: impl });
    expect(res).toMatchObject({ ok: true, callingSaved: false });
  });

  it("does not save the calling when the accept itself fails", async () => {
    const { impl, calls } = fakeFetch({
      "/api/organizations/accept": { status: 403, body: { error: "Email mismatch" } },
    });
    const res = await acceptInviteWithCalling({ token: "tok", accessToken: "jwt", calling: "Bishop", fetchImpl: impl });
    expect(res).toEqual({ ok: false, status: 403, data: { error: "Email mismatch" } });
    expect(calls).toHaveLength(1);
  });
});
