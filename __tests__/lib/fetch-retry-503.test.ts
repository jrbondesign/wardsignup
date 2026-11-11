/**
 * @jest-environment node
 */

import { fetchRetryOn503 } from "@/lib/fetch-retry-503";

function jsonRes(status: number, body: unknown = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("fetchRetryOn503", () => {
  it("retries 503 with backoff and succeeds without creating a second produce after success", async () => {
    const delays: number[] = [];
    const makeRequest = jest
      .fn()
      .mockResolvedValueOnce(jsonRes(503, { error: "taking longer" }))
      .mockResolvedValueOnce(jsonRes(200, { signup_id: "s-1" }));

    const res = await fetchRetryOn503(makeRequest, {
      delaysMs: [25, 50],
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signup_id: "s-1" });
    expect(makeRequest).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([25]);
  });

  it("does not retry a 400 or 409", async () => {
    const make400 = jest.fn().mockResolvedValue(jsonRes(400, { error: "Name is required" }));
    const bad = await fetchRetryOn503(make400, { delaysMs: [1], sleep: async () => {} });
    expect(bad.status).toBe(400);
    expect(make400).toHaveBeenCalledTimes(1);

    const make409 = jest.fn().mockResolvedValue(jsonRes(409, { error: "This item is already full" }));
    const full = await fetchRetryOn503(make409, { delaysMs: [1], sleep: async () => {} });
    expect(full.status).toBe(409);
    expect(make409).toHaveBeenCalledTimes(1);
  });

  it("does not retry application errors, only network failures", async () => {
    const makeRequest = jest.fn().mockRejectedValue(new Error("Please enter your name"));
    await expect(fetchRetryOn503(makeRequest, { delaysMs: [1], sleep: async () => {} })).rejects.toThrow(
      "Please enter your name",
    );
    expect(makeRequest).toHaveBeenCalledTimes(1);

    const net = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    const res = await fetchRetryOn503(net, { delaysMs: [1], sleep: async () => {} });
    expect(res.status).toBe(200);
    expect(net).toHaveBeenCalledTimes(2);
  });
});
