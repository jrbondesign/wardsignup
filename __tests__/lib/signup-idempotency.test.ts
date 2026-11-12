import {
  clearSignupIdempotencyMemory,
  findPublicItemSignupMatch,
  findReusableEmailItemSignup,
  findReusableEmailSignup,
  memoryIdempotencyStore,
  parseSignupIdempotencyKey,
  signupIdempotencyMemorySize,
  withIdempotency,
} from "@/lib/signup-idempotency";

describe("parseSignupIdempotencyKey", () => {
  it("accepts a uuid and lowercases it", () => {
    expect(parseSignupIdempotencyKey("A3E2B1C4-1234-4ABC-8DEF-1234567890AB")).toBe(
      "a3e2b1c4-1234-4abc-8def-1234567890ab",
    );
  });
  it("rejects missing or malformed values", () => {
    expect(parseSignupIdempotencyKey(undefined)).toBeNull();
    expect(parseSignupIdempotencyKey("not-a-uuid")).toBeNull();
    expect(parseSignupIdempotencyKey("")).toBeNull();
  });
});

describe("findReusableEmailSignup", () => {
  const now = new Date("2026-11-11T18:00:00Z");
  const row = {
    session_id: "s1",
    member_email: "Jane@Example.com",
    signed_up_at: "2026-11-11T17:50:00Z",
    id: "signup-1",
  };

  it("reuses a recent signup on the same slot with the same email", () => {
    expect(findReusableEmailSignup([row], { sessionId: "s1", memberEmail: "jane@example.com", now })?.id).toBe(
      "signup-1",
    );
  });

  it("does not reuse a different email on the same slot", () => {
    expect(findReusableEmailSignup([row], { sessionId: "s1", memberEmail: "other@example.com", now })).toBeNull();
  });

  it("reuses a recent exact name on the same slot when there is no email", () => {
    const named = {
      session_id: "s1",
      member_email: null,
      member_name: "Alex Reed",
      signed_up_at: row.signed_up_at,
      id: "signup-2",
    };
    expect(
      findReusableEmailSignup([named], { sessionId: "s1", memberEmail: "", memberName: "alex reed", now })?.id,
    ).toBe("signup-2");
  });

  it("does not reuse a name-only match without a name, on a different name, or after the window", () => {
    const named = {
      session_id: "s1",
      member_email: null,
      member_name: "Alex Reed",
      signed_up_at: row.signed_up_at,
      id: "signup-2",
    };
    expect(findReusableEmailSignup([named], { sessionId: "s1", memberEmail: "", now })).toBeNull();
    expect(
      findReusableEmailSignup([named], { sessionId: "s1", memberEmail: "", memberName: "Jordan Reed", now }),
    ).toBeNull();
    const stale = { ...named, signed_up_at: "2026-11-11T16:00:00Z" };
    expect(
      findReusableEmailSignup([stale], { sessionId: "s1", memberEmail: "", memberName: "Alex Reed", now }),
    ).toBeNull();
  });

  it("ignores stale rows and other slots", () => {
    const stale = { ...row, signed_up_at: "2026-11-11T16:00:00Z" };
    expect(findReusableEmailSignup([stale], { sessionId: "s1", memberEmail: "jane@example.com", now })).toBeNull();
    expect(findReusableEmailSignup([row], { sessionId: "s-other", memberEmail: "jane@example.com", now })).toBeNull();
  });
});

describe("findReusableEmailItemSignup", () => {
  const now = new Date("2026-11-11T18:00:00Z");
  it("reuses a recent item signup with the same email and item", () => {
    const row = { item_id: "i1", custom_label: null, member_email: "a@b.c", signed_up_at: "2026-11-11T17:59:00Z" };
    expect(findReusableEmailItemSignup([row], { itemId: "i1", memberEmail: "a@b.c", now })).toEqual(row);
  });
  it("does not reuse a different item", () => {
    const row = { item_id: "i1", custom_label: null, member_email: "a@b.c", signed_up_at: "2026-11-11T17:59:00Z" };
    expect(findReusableEmailItemSignup([row], { itemId: "i2", memberEmail: "a@b.c", now })).toBeNull();
  });

  it("reuses a recent no-email item signup with the same name and quantity", () => {
    const row = {
      item_id: "i1",
      custom_label: null,
      member_email: null,
      member_name: "Alex Reed",
      quantity: 1,
      signed_up_at: "2026-11-11T17:59:00Z",
    };
    expect(
      findReusableEmailItemSignup([row], {
        itemId: "i1",
        memberEmail: "",
        memberName: "alex reed",
        quantity: 1,
        now,
      }),
    ).toEqual(row);
  });

  it("does not reuse a no-email item signup with a different quantity or name", () => {
    const row = {
      item_id: "i1",
      custom_label: null,
      member_email: null,
      member_name: "Alex Reed",
      quantity: 1,
      signed_up_at: "2026-11-11T17:59:00Z",
    };
    expect(
      findReusableEmailItemSignup([row], {
        itemId: "i1",
        memberEmail: "",
        memberName: "Alex Reed",
        quantity: 2,
        now,
      }),
    ).toBeNull();
    expect(
      findReusableEmailItemSignup([row], {
        itemId: "i1",
        memberEmail: "",
        memberName: "Jordan Reed",
        quantity: 1,
        now,
      }),
    ).toBeNull();
  });
});

describe("findPublicItemSignupMatch", () => {
  const rows = [
    { item_id: "i1", member_name: "Alex Reed", signup_note: "I can bake pies", quantity: 1 },
    { item_id: "i2", member_name: "Alex Reed", signup_note: null, quantity: 1 },
  ];
  it("finds the public row for the same item, name, and quantity", () => {
    expect(
      findPublicItemSignupMatch(rows, {
        itemId: "i1",
        memberName: "alex reed",
        quantity: 1,
        signupNote: "I can bake pies",
      }),
    ).toEqual(rows[0]);
  });
  it("ignores hidden names and other items", () => {
    expect(findPublicItemSignupMatch(rows, { itemId: "i1", memberName: "Alex Reed", quantity: 2 })).toBeNull();
    expect(
      findPublicItemSignupMatch(
        [{ item_id: "i1", member_name: "", quantity: 1 }],
        { itemId: "i1", memberName: "Alex Reed", quantity: 1 },
      ),
    ).toBeNull();
  });
});

describe("withIdempotency", () => {
  beforeEach(() => clearSignupIdempotencyMemory());

  it("runs produce once for the same key and returns the first result", async () => {
    const store = memoryIdempotencyStore();
    const produce = jest.fn(async () => ({ signup_id: "s-1" }));
    const first = await withIdempotency("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", store, produce);
    const second = await withIdempotency("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", store, produce);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ value: { signup_id: "s-1" }, reused: false });
    expect(second).toEqual({ value: { signup_id: "s-1" }, reused: true });
  });

  it("runs produce for each different key and when the key is missing", async () => {
    const store = memoryIdempotencyStore();
    const produce = jest.fn(async (): Promise<{ n: number }> => ({ n: produce.mock.calls.length }));
    await withIdempotency(null, store, produce);
    await withIdempotency("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", store, produce);
    await withIdempotency("bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", store, produce);
    expect(produce).toHaveBeenCalledTimes(3);
  });

  it("runs produce only once when two calls overlap on the same key", async () => {
    const store = memoryIdempotencyStore();
    let releases: Array<() => void> = [];
    const produce = jest.fn(
      () =>
        new Promise<{ signup_id: string }>((resolve) => {
          releases.push(() => resolve({ signup_id: "s-overlap" }));
        }),
    );
    const first = withIdempotency("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", store, produce);
    // Let the first produce start and register inflight.
    for (let i = 0; i < 10 && releases.length === 0; i++) {
      await Promise.resolve();
    }
    const second = withIdempotency("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", store, produce);
    expect(releases).toHaveLength(1);
    releases[0]!();
    await expect(first).resolves.toEqual({ value: { signup_id: "s-overlap" }, reused: false });
    await expect(second).resolves.toEqual({ value: { signup_id: "s-overlap" }, reused: true });
    expect(produce).toHaveBeenCalledTimes(1);
  });
});

describe("memoryIdempotencyStore", () => {
  beforeEach(() => clearSignupIdempotencyMemory());

  it("evicts other expired keys when a new value is stored", async () => {
    let nowMs = 1_000;
    const store = memoryIdempotencyStore(() => nowMs, 100);
    await store.set("old", { n: 1 });
    expect(signupIdempotencyMemorySize()).toBe(1);
    nowMs = 1_200;
    await store.set("new", { n: 2 });
    expect(signupIdempotencyMemorySize()).toBe(1);
    expect(await store.get("old")).toBeUndefined();
    expect(await store.get("new")).toEqual({ n: 2 });
  });
});
