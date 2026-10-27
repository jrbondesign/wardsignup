/**
 * Accept an org invite, then save the accepting user's calling if they picked one.
 *
 * The calling is optional and must never block accepting: the accept call runs
 * first, and a failed calling save (network error, 409 before the calling
 * migration, anything else) is swallowed so the accept still completes.
 */

export type AcceptInviteResult =
  | { ok: true; data: Record<string, unknown>; callingSaved: boolean }
  | { ok: false; status: number; data: Record<string, unknown> };

export async function acceptInviteWithCalling(opts: {
  token: string;
  accessToken: string;
  calling: string | null;
  fetchImpl?: typeof fetch;
}): Promise<AcceptInviteResult> {
  const { token, accessToken, calling } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  const acceptRes = await doFetch("/api/organizations/accept", {
    method: "POST",
    headers,
    body: JSON.stringify({ token }),
  });
  const data = ((await acceptRes.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (!acceptRes.ok) return { ok: false, status: acceptRes.status, data };

  let callingSaved = false;
  if (calling) {
    try {
      const res = await doFetch("/api/organizer-profile/calling", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ calling }),
      });
      callingSaved = res.ok;
      if (!res.ok) console.warn("Calling not saved on invite accept:", res.status);
    } catch (error) {
      console.warn("Calling not saved on invite accept:", error);
    }
  }
  return { ok: true, data, callingSaved };
}
