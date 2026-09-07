"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";

type Member = {
  id: string;
  user_id: string | null;
  invited_email: string;
  role: "owner" | "admin";
  status: "pending" | "accepted" | "revoked";
  created_at: string;
  accepted_at: string | null;
  transfer_on_accept?: boolean;
};

interface Props {
  organizationId: string;
  isOwner: boolean;
}

const CONFIRM_PHRASE = "transfer ownership";

type TransferTarget =
  | { kind: "existing"; memberId: string; email: string }
  | { kind: "new" };

export default function OrgMembersSection({ organizationId, isOwner }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);
  const [transferEmailInput, setTransferEmailInput] = useState("");
  const [transferEmailConfirm, setTransferEmailConfirm] = useState("");
  const [transferPhraseConfirm, setTransferPhraseConfirm] = useState("");
  const [transferring, setTransferring] = useState(false);

  const getToken = async () => {
    const supabase = createClientComponentClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const load = async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/organizations/${organizationId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMembers(data.members ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    setInviting(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ kind: "error", text: "You're signed out." });
        return;
      }
      const res = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data?.error ?? "Failed to send invite." });
        return;
      }
      setMessage({ kind: "ok", text: `Invitation sent to ${trimmed}.` });
      setInviteEmail("");
      await load();
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (memberId: string, email: string) => {
    if (!confirm(`Remove ${email}? They will lose access immediately.`)) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ kind: "error", text: data?.error ?? "Failed to remove member." });
    }
  };

  const openTransfer = (target: TransferTarget) => {
    setTransferTarget(target);
    setTransferEmailInput("");
    setTransferEmailConfirm("");
    setTransferPhraseConfirm("");
  };

  const closeTransfer = () => {
    if (transferring) return;
    setTransferTarget(null);
    setTransferEmailInput("");
    setTransferEmailConfirm("");
    setTransferPhraseConfirm("");
  };

  const submitTransfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ kind: "error", text: "You're signed out." });
        return;
      }
      let res: Response;
      if (transferTarget.kind === "existing") {
        res = await fetch(`/api/organizations/${organizationId}/transfer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ newOwnerMemberId: transferTarget.memberId }),
        });
      } else {
        res = await fetch(`/api/organizations/${organizationId}/members`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: transferEmailInput.trim(), transferOwnership: true }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data?.error ?? "Failed to transfer ownership." });
        return;
      }
      if (transferTarget.kind === "existing") {
        setMessage({
          kind: "ok",
          text: `Ownership transferred to ${transferTarget.email}. You're now a co-admin.`,
        });
      } else {
        setMessage({
          kind: "ok",
          text: `Invitation sent to ${transferEmailInput.trim()}. Ownership will transfer when they accept.`,
        });
      }
      setTransferTarget(null);
      setTransferEmailInput("");
      setTransferEmailConfirm("");
      setTransferPhraseConfirm("");
      await load();
    } finally {
      setTransferring(false);
    }
  };

  // Path A: target email is fixed; confirm input must match it.
  // Path B: target email is what the owner typed at the top; confirm input must match that.
  const intendedNewOwnerEmail =
    transferTarget?.kind === "existing"
      ? transferTarget.email
      : transferEmailInput.trim().toLowerCase();
  const emailMatches =
    intendedNewOwnerEmail.length > 0 &&
    transferEmailConfirm.trim().toLowerCase() === intendedNewOwnerEmail;
  const phraseMatches = transferPhraseConfirm.trim().toLowerCase() === CONFIRM_PHRASE;
  const canConfirm = emailMatches && phraseMatches && !transferring;

  const pendingHandoff = members.find(
    (m) => m.transfer_on_accept && m.status === "pending",
  );

  return (
    <section className="mt-8 bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
      <h2 className="font-serif text-[20px] text-[#0D2B35] mb-1">Co-admins</h2>
      <p className="text-[13px] text-[#5A8399] mb-5">
        Co-admins can edit events, manage signups, send invites, and view analytics. Only the owner can delete events or remove members.
      </p>

      {isOwner && (
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 mb-5">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            disabled={inviting}
            className="flex-1 px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>
      )}

      {isOwner && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => openTransfer({ kind: "new" })}
            className="text-[13px] font-semibold text-[#0E96B0] hover:underline"
          >
            Transfer ownership to a new person…
          </button>
          {pendingHandoff && (
            <p className="mt-2 text-[12px] text-[#5A8399]">
              Pending ownership transfer to <strong>{pendingHandoff.invited_email}</strong>. Cancel that invite below to issue a new one.
            </p>
          )}
        </div>
      )}

      {message && (
        <p className={`mb-4 text-[13px] ${message.kind === "ok" ? "text-[#0F6E56]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[#5A8399]">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-[#5A8399]">No members yet.</p>
      ) : (
        <ul className="divide-y divide-[#0E96B0]/10">
          {[...members]
            .sort((a, b) => {
              if (a.role === "owner" && b.role !== "owner") return -1;
              if (b.role === "owner" && a.role !== "owner") return 1;
              return a.created_at.localeCompare(b.created_at);
            })
            .map((m) => {
            const isPendingHandoff = !!m.transfer_on_accept && m.status === "pending";
            const canTransferTo = isOwner && m.role === "admin" && m.status === "accepted" && !!m.user_id;
            return (
              <li key={m.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] text-[#0D2B35] font-medium truncate">{m.invited_email}</div>
                  <div className="text-[12px] text-[#5A8399]">
                    {m.role === "owner" ? "Owner" : "Co-admin"}
                    {" · "}
                    {m.status === "accepted" ? "Active" : m.status === "pending" ? "Pending" : "Revoked"}
                    {isPendingHandoff && (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-[#FFF3D6] text-[#8A6300] text-[11px] font-semibold">
                        Pending owner — transfers on acceptance
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {canTransferTo && (
                    <button
                      type="button"
                      onClick={() =>
                        openTransfer({ kind: "existing", memberId: m.id, email: m.invited_email })
                      }
                      className="text-[13px] font-semibold text-[#0E96B0] hover:underline"
                    >
                      Transfer ownership
                    </button>
                  )}
                  {isOwner && m.role !== "owner" && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(m.id, m.invited_email)}
                      className="text-[13px] font-semibold text-red-600 hover:underline"
                    >
                      {isPendingHandoff ? "Cancel" : "Remove"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {transferTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeTransfer}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-[20px] text-[#0D2B35] mb-2">Transfer ownership</h3>
            <p className="text-[13px] text-[#5A8399] mb-4 leading-relaxed">
              {transferTarget.kind === "existing" ? (
                <>
                  You will become a co-admin of this organization. <strong>{transferTarget.email}</strong> will become the owner. The new owner can later transfer ownership back, but you cannot undo this yourself.
                </>
              ) : (
                <>
                  Send an invitation that will transfer ownership of this organization when the recipient accepts. Until they accept, you remain the owner. You can cancel the pending transfer at any time.
                </>
              )}
            </p>

            {transferTarget.kind === "new" && (
              <div className="mb-4">
                <label className="block text-[12px] font-semibold text-[#0D2B35] mb-1.5">
                  New owner&rsquo;s email
                </label>
                <input
                  type="email"
                  value={transferEmailInput}
                  onChange={(e) => setTransferEmailInput(e.target.value)}
                  disabled={transferring}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[12px] font-semibold text-[#0D2B35] mb-1.5">
                Type the new owner&rsquo;s email to confirm
              </label>
              <input
                type="text"
                value={transferEmailConfirm}
                onChange={(e) => setTransferEmailConfirm(e.target.value)}
                disabled={transferring || (transferTarget.kind === "new" && !transferEmailInput.trim())}
                placeholder={
                  transferTarget.kind === "existing"
                    ? transferTarget.email
                    : transferEmailInput.trim() || "Enter the email above first"
                }
                className="w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60 disabled:bg-[#F4FAFB]"
              />
            </div>

            <div className="mb-5">
              <label className="block text-[12px] font-semibold text-[#0D2B35] mb-1.5">
                Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm
              </label>
              <input
                type="text"
                value={transferPhraseConfirm}
                onChange={(e) => setTransferPhraseConfirm(e.target.value)}
                disabled={transferring}
                placeholder={CONFIRM_PHRASE}
                className="w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeTransfer}
                disabled={transferring}
                className="text-[13px] font-semibold text-[#5A8399] hover:text-[#0D2B35] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransfer}
                disabled={!canConfirm}
                className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {transferring
                  ? "Transferring…"
                  : transferTarget.kind === "existing"
                    ? "Confirm transfer"
                    : "Send transfer invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
