const apiUrl = process.env.WARDSIGNUP_API_URL ?? "https://wardsignup.com";
const apiKey = process.env.WARDSIGNUP_API_KEY ?? "";
const brandId = process.env.WARDSIGNUP_BRAND_ID ?? "wardsignup";

if (!apiKey) {
  console.error("[wardsignup-mcp] WARDSIGNUP_API_KEY is not set. Set it to your API key from wardsignup.com/dashboard.");
}

export { apiUrl, brandId };

export async function apiCall<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "x-brand-id": brandId,
      ...(options?.headers ?? {}),
    },
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text };
  }

  if (!res.ok) {
    const errMsg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return json as T;
}
