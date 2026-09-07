-- MCP API tokens: long-lived keys for Claude Desktop / MCP server access.
-- One active token per (user_id, brand_id). The raw token is never stored —
-- only a SHA-256 hash is kept so a DB breach cannot replay tokens.

create table if not exists mcp_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  brand_id      text not null,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Index for fast lookup by hash (the hot path on every MCP API call)
create index if not exists mcp_tokens_token_hash_idx on mcp_tokens (token_hash);

-- One token per user per brand (the create endpoint enforces this too, but belt + suspenders)
create unique index if not exists mcp_tokens_user_brand_idx on mcp_tokens (user_id, brand_id);

-- RLS: users can see and delete their own tokens; inserts/updates are done server-side via service role
alter table mcp_tokens enable row level security;

create policy "Users can view their own MCP tokens"
  on mcp_tokens for select
  using (auth.uid() = user_id);

create policy "Users can delete their own MCP tokens"
  on mcp_tokens for delete
  using (auth.uid() = user_id);
