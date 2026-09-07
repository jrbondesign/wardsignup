import { createClient } from "@supabase/supabase-js";
import { createAnonSupabaseClient } from "./auth";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

type RpcGetPublicArgs = Database["public"]["Functions"]["get_public_campaign"]["Args"];
type RpcSignupArgs = Database["public"]["Functions"]["create_signup_if_capacity"]["Args"];

/** SECURITY DEFINER RPC; safe public fields only (id, name, description). */
export function getPublicCampaignById(campaignId: string) {
  const args: RpcGetPublicArgs = { campaign_id: campaignId };
  // postgrest-js RPC inference does not pick up manual Database.Functions for this client; args are typed above.
  return supabase.rpc("get_public_campaign", args as never);
}

export function createSignupIfCapacityRpc(args: RpcSignupArgs) {
  const client = createAnonSupabaseClient();
  return client.rpc("create_signup_if_capacity", args as never);
}
