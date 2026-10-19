"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import {
  allowlistOrgFeatures,
  combineOrgFeatures,
  gcalClientSwitchOn,
  type OrgFeatures,
  type ServerOrgFeatures,
} from "@/lib/org-features-client";

// One request per org per page load, shared by every component that asks.
const inflight = new Map<string, Promise<ServerOrgFeatures>>();

async function fetchServerFeatures(orgId: string): Promise<ServerOrgFeatures> {
  try {
    const supabase = createClientComponentClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch(`/api/organizations/${orgId}/features`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ServerOrgFeatures;
  } catch {
    return null;
  }
}

/**
 * Feature gates for an org: allowlist right away, plus PostHog flags once the
 * server answers. Fails closed to the allowlist on any error.
 */
export function useOrgFeatures(orgId: string | null | undefined): OrgFeatures {
  const allowlist = allowlistOrgFeatures(orgId);
  const [server, setServer] = useState<{ orgId: string; value: ServerOrgFeatures } | null>(null);
  const needsServer = Boolean(orgId) && !(allowlist.gcalSync && allowlist.coverImages);

  useEffect(() => {
    if (!orgId || !needsServer) return;
    let cancelled = false;
    let p = inflight.get(orgId);
    if (!p) {
      p = fetchServerFeatures(orgId);
      inflight.set(orgId, p);
      // Failed lookups can retry on the next mount.
      p.then((v) => {
        if (!v) inflight.delete(orgId);
      });
    }
    p.then((value) => {
      if (!cancelled) setServer({ orgId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, needsServer]);

  const serverValue = server && server.orgId === orgId ? server.value : null;
  return combineOrgFeatures(allowlist, serverValue, gcalClientSwitchOn());
}
