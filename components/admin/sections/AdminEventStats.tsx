"use client";

import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Signup and capacity stat tiles. */
export default function AdminEventStats({ ctx }: { ctx: AdminEventView }) {
  const {
    eventType,
    fillPct,
    items,
    totalCapacity,
    totalGuests,
    totalPeople,
    totalSignups,
  } = ctx;

  return (
    (eventType === "spots" || eventType === "rsvp") ? (
    <>
      {/* unlimited (capacity ≥ 999): just show attendee count, hide the sentinel */}
      {totalCapacity >= 999 ? (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center">
            <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#0E96B0] whitespace-nowrap">Registered</div>
            <div className="text-3xl font-semibold text-[#054F64]">{totalPeople}</div>
            {totalPeople !== totalSignups && (
              <div className="text-[10px] text-[#5A8399] mt-0.5">{totalSignups} {totalSignups === 1 ? "signup" : "signups"}</div>
            )}
          </div>
          <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center">
            <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#1D9E75] whitespace-nowrap">Capacity</div>
            <div className="text-2xl font-semibold text-[#0F6E56]">Unlimited</div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center">
              <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#0E96B0] whitespace-nowrap">Total spots</div>
              <div className="text-3xl font-semibold text-[#054F64]">{totalCapacity}</div>
            </div>
            <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center">
              <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#1D9E75] whitespace-nowrap">Signed up</div>
              <div className="text-3xl font-semibold text-[#0F6E56]">{totalPeople}</div>
              {totalGuests > 0 && (
                <div className="text-[10px] text-[#5A8399] mt-0.5">plus {totalGuests} {totalGuests === 1 ? "guest" : "guests"} ({totalSignups + totalGuests} people)</div>
              )}
            </div>
            <div className="rounded-xl p-4 flex flex-col items-center" style={{ background: (totalCapacity - totalPeople) === 0 ? "#fef2f2" : "#fdf6ec" }}>
              <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase whitespace-nowrap"
                   style={{ color: (totalCapacity - totalPeople) === 0 ? "#ef4444" : "#d97706" }}>Remaining</div>
              <div className="text-3xl font-semibold"
                   style={{ color: (totalCapacity - totalPeople) === 0 ? "#dc2626" : "#b45309" }}>{Math.max(0, totalCapacity - totalPeople)}</div>
            </div>
          </div>
          <div className="h-1.5 bg-[#0E96B0]/10 rounded-full overflow-hidden mb-1.5">
            <div className="h-full rounded-full bg-gradient-to-r from-[#22C8D8] to-[#08647E] transition-all"
                 style={{ width: `${Math.min(100, fillPct)}%` }} />
          </div>
          <div className="text-[11px] text-[#5A8399] text-right mb-5">{Math.min(100, fillPct)}% filled</div>
        </>
      )}
    </>
  ) : (() => {
    const totalItems = items.length;
    const itemClaimed = (it: { item_signups?: { quantity?: number }[] }) =>
      (it.item_signups ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);
    const totalClaimed = items.reduce((sum, it) => sum + itemClaimed(it), 0);
    const unclaimed = items.filter((it) => itemClaimed(it) === 0).length;
    return (
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center">
          <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#0E96B0] whitespace-nowrap">Items</div>
          <div className="text-3xl font-semibold text-[#054F64]">{totalItems}</div>
        </div>
        <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center">
          <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#1D9E75] whitespace-nowrap">Claimed</div>
          <div className="text-3xl font-semibold text-[#0F6E56]">{totalClaimed}</div>
        </div>
        <div className="rounded-xl p-4 flex flex-col items-center" style={{ background: unclaimed === 0 ? "#edfaf4" : "#fdf6ec" }}>
          <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase whitespace-nowrap"
               style={{ color: unclaimed === 0 ? "#1D9E75" : "#d97706" }}>Unclaimed</div>
          <div className="text-3xl font-semibold"
               style={{ color: unclaimed === 0 ? "#0F6E56" : "#b45309" }}>{unclaimed}</div>
        </div>
      </div>
    );
  })()
  );
}
