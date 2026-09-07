import { createClientComponentClient } from "@/lib/auth";

/**
 * One exchange per OAuth code (or OTP hash). React Strict Mode runs the callback twice;
 * reusing the same Promise avoids a second HTTP request after the code is consumed.
 * Successful results stay cached so a late second effect still sees { ok: true } without re-fetching.
 */
const exchangeByKey = new Map<string, Promise<{ ok: boolean; message?: string }>>();

/** Same-code dedupe for client-side PKCE exchange (magic link / OAuth fallback). */
const clientPkceByCode = new Map<
  string,
  Promise<{ ok: boolean; accessToken?: string; message?: string }>
>();

export function fetchAuthExchangeDeduped(
  fullSearch: string,
  dedupeKey: string,
): Promise<{ ok: boolean; message?: string }> {
  let p = exchangeByKey.get(dedupeKey);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/auth/callback/exchange${fullSearch}`, {
        credentials: "include",
        method: "GET",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        exchangeByKey.delete(dedupeKey);
        return {
          ok: false,
          message: body.message ?? res.statusText,
        };
      }
      return { ok: true };
    })();
    exchangeByKey.set(dedupeKey, p);
  }
  return p;
}

/**
 * When the server route cannot see PKCE cookies (magic link from email, partitioned cookies, etc.),
 * the browser client may still complete exchangeCodeForSession using the same cookie storage.
 */
export function exchangePkceClientDeduped(code: string): Promise<{
  ok: boolean;
  accessToken?: string;
  message?: string;
}> {
  let p = clientPkceByCode.get(code);
  if (!p) {
    p = (async () => {
      const supabase = createClientComponentClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        clientPkceByCode.delete(code);
        return { ok: false, message: error.message };
      }
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        clientPkceByCode.delete(code);
        return { ok: false, message: "Sign-in incomplete." };
      }
      return { ok: true, accessToken };
    })();
    clientPkceByCode.set(code, p);
  }
  return p;
}
