"use client";

import { useState } from "react";

export type CreatorRow = {
  email: string;
  wardName?: string | null;
  organization?: string | null;
  calling?: string | null;
  events: number;
  sessions: number;
  signups: number;
};

function TextValue({ value }: { value: string | null | undefined }) {
  return value ? (
    <span className="text-[#0D2B35]">{value}</span>
  ) : (
    <span className="text-[#9BB7C4]">Not set</span>
  );
}

/**
 * Creators table on /admin/metrics.
 *
 * Visible columns are Email, Ward/Unit, and Organization. Calling, Events,
 * Sessions, and Signups stay available from a Details control inside the email
 * cell. The table has no per-row actions. A short minimum width lets a phone
 * scroll inside the card; it is not the old 720px seven-column width.
 */
export function CreatorsTable({
  creators,
  callingsAvailable = true,
  wardsAvailable = true,
}: {
  creators: CreatorRow[];
  /** False when the server could not read callings (calling migration not applied yet). */
  callingsAvailable?: boolean;
  /** False when the server could not read Ward/Unit (ward migration not applied yet). */
  wardsAvailable?: boolean;
}) {
  const [openEmails, setOpenEmails] = useState<ReadonlySet<string>>(new Set());

  if (creators.length === 0) {
    return <p className="text-sm text-[#5A8399]">No creators yet.</p>;
  }

  function toggle(email: string) {
    setOpenEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  return (
    <>
      {(!callingsAvailable || !wardsAvailable) && (
        <p className="text-[12px] text-[#5A8399] mb-3" data-testid="identity-unavailable">
          Ward/Unit and Calling will fill in once the database update for them is applied.
        </p>
      )}
      <div
        data-testid="metrics-hscroll"
        data-metrics-scroll="creators"
        className="@container min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
      >
        <table className="w-full min-w-[22rem] table-fixed">
          <thead>
            <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
              <th scope="col" className="text-left pb-3 font-semibold w-[42%]">Email</th>
              <th scope="col" className="text-left pb-3 pl-3 font-semibold">Ward/Unit</th>
              <th scope="col" className="text-left pb-3 pl-3 font-semibold">Organization</th>
            </tr>
          </thead>
          {creators.map((c, index) => {
            const open = openEmails.has(c.email);
            const detailsId = `creator-details-${index}`;
            return (
              <tbody key={c.email} className="border-b border-[rgba(14,150,176,0.06)] last:border-0">
                <tr data-testid="creator-row">
                  <td className="py-2.5 pr-2 align-top text-[13px]">
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <span className="break-all text-[#0D2B35]" title={c.email}>{c.email}</span>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={detailsId}
                        onClick={() => toggle(c.email)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape" && open) {
                            e.preventDefault();
                            toggle(c.email);
                          }
                        }}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0] ${
                          open ? "bg-[#0E96B0] text-white" : "bg-[#E6F7FB] text-[#08647E]"
                        }`}
                      >
                        {open ? "Hide details" : "Details"}
                        <span className="sr-only"> for {c.email}</span>
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 pl-3 align-top text-[13px] break-words" data-testid="creator-ward" title={c.wardName ?? undefined}>
                    <TextValue value={c.wardName} />
                  </td>
                  <td className="py-2.5 pl-3 align-top text-[13px] break-words" data-testid="creator-organization" title={c.organization ?? undefined}>
                    <TextValue value={c.organization} />
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={3} className="p-0">
                      <div
                        id={detailsId}
                        role="region"
                        aria-label={`Details for ${c.email}`}
                        data-testid="creator-details"
                        className="sticky left-0 w-[100cqw] max-w-full py-3"
                      >
                        <div className="mb-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399]">Calling</div>
                          <div className="mt-0.5 break-words text-[13px]" data-testid="creator-calling" title={c.calling ?? undefined}>
                            <TextValue value={c.calling} />
                          </div>
                        </div>
                        <dl className="grid grid-cols-3 gap-2">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399]">Events</dt>
                            <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#0D2B35]" data-testid="creator-events">{c.events}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399]">Sessions</dt>
                            <dd className="mt-0.5 text-[13px] tabular-nums text-[#5A8399]" data-testid="creator-sessions">{c.sessions}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399]">Signups</dt>
                            <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#0E96B0]" data-testid="creator-signups">{c.signups}</dd>
                          </div>
                        </dl>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}
