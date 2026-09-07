"use client";

import { useState } from "react";
import { createClientComponentClient } from "@/lib/auth";

const SETUP_STEPS = [
  {
    step: "1",
    title: "Download Claude Desktop",
    body: (
      <>
        Get the free app at{" "}
        <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer" className="text-[#0E96B0] underline underline-offset-2 hover:text-[#08647E]">
          claude.ai/download
        </a>
        . It&apos;s available for Mac and Windows.
      </>
    ),
  },
  {
    step: "2",
    title: "Generate your API key",
    body: "Click the button below. You'll get a config snippet that connects Claude to your account.",
  },
  {
    step: "3",
    title: "Add the config to Claude Desktop",
    body: (
      <>
        Open Claude Desktop → Settings → Developer → Edit Config. Paste the snippet into{" "}
        <code className="font-mono bg-[#F0F9FB] px-1 rounded text-[#0D2B35]">claude_desktop_config.json</code>{" "}
        and save.
      </>
    ),
  },
  {
    step: "4",
    title: "Restart Claude Desktop",
    body: "Quit and reopen Claude Desktop. You'll see Ward Signup tools available in any conversation.",
  },
];

export default function ConnectToClaudeCard() {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/auth/create-mcp-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json() as { claudeConfig?: object; error?: string };
      if (!res.ok || !data.claudeConfig) {
        setError(data.error ?? "Failed to generate API key");
        return;
      }
      setConfig(JSON.stringify(data.claudeConfig, null, 2));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/auth/create-mcp-token", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setConfig(null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setRevoking(false);
    }
  }

  function copy() {
    if (!config) return;
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-[rgba(14,150,176,0.18)] bg-white p-6 shadow-[0_2px_12px_rgba(8,100,126,0.06)]">
      <div className="flex items-start gap-3 mb-3">
        {/* Claude logo-ish sparkle icon */}
        <div className="w-9 h-9 rounded-xl bg-[#E6F7FB] flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
            <path d="M12 2l2.09 6.26L21 10l-6.91 1.74L12 18l-2.09-6.26L3 10l6.91-1.74L12 2z" fill="#0E96B0"/>
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-[15px] text-[#0D2B35]">Use with Claude</h3>
          <p className="text-sm text-[#5A8399] leading-relaxed mt-0.5">
            Create and manage events directly from Claude Desktop or any MCP-compatible AI client.
          </p>
        </div>
        <button
          onClick={() => setShowSteps((s) => !s)}
          className="text-xs font-medium text-[#0E96B0] hover:text-[#08647E] transition-colors flex-shrink-0 mt-0.5"
        >
          {showSteps ? "Hide steps" : "How to set up"}
        </button>
      </div>

      {showSteps && (
        <div className="mb-4 space-y-3">
          {SETUP_STEPS.map(({ step, title, body }) => (
            <div key={step} className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-[#0E96B0]">{step}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#0D2B35]">{title}</p>
                <p className="text-xs text-[#5A8399] leading-relaxed mt-0.5">{body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      {!config ? (
        <button
          onClick={generate}
          disabled={loading}
          className="text-sm font-semibold px-4 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-default"
        >
          {loading ? "Generating…" : "Generate API Key"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[#5A8399]">
            Add this to your <code className="font-mono bg-[#F4FAFB] px-1 rounded">claude_desktop_config.json</code> and restart Claude Desktop.
          </p>
          <div className="relative">
            <pre className="text-xs bg-[#F4FAFB] rounded-xl p-4 overflow-x-auto text-[#0D2B35] font-mono leading-relaxed border border-[rgba(14,150,176,0.12)]">
              {config}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-[rgba(14,150,176,0.22)] text-[#0E96B0] hover:bg-[#E6F7FB] transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Save this key — it won&apos;t be shown again. Generating a new key will revoke the current one.
          </p>
          <button
            onClick={revoke}
            disabled={revoking}
            className="text-xs text-[#5A8399] hover:text-red-500 transition-colors underline underline-offset-2"
          >
            {revoking ? "Revoking…" : "Revoke key"}
          </button>
        </div>
      )}
    </div>
  );
}
