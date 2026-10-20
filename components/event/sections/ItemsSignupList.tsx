"use client";

import { orderBySection } from "@/components/event/event-page-shared";
import { Fragment } from "react";
import EmailTypoHint from "@/components/EmailTypoHint";
import { type EventPageView } from "@/components/event/hooks/deriveEventPageView";

/** Item list and custom-item form for items events. */
export default function ItemsSignupList({ ctx }: { ctx: EventPageView }) {
  const {
    customError,
    customItem,
    customSignups,
    customSubmitting,
    eventType,
    expandedItem,
    handleCustomItemSignup,
    handleItemSignup,
    itemError,
    itemFormData,
    itemSubmitting,
    items,
    setCustomItem,
    setExpandedItem,
    setItemError,
    setItemFormData,
    showSignupsPublicly,
    trackEmailEntered,
    trackFormStarted,
  } = ctx;

  return (
    eventType === "items" && (
    <div className="space-y-3 mb-10">
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
          <p className="text-sm text-[#5A8399]">No items listed yet. Check back soon!</p>
        </div>
      ) : (
        orderBySection(items).map((item, idx, arr) => {
          const claimed = (item.item_signups ?? []).reduce((s, r) => s + ((r as { quantity?: number }).quantity ?? 1), 0);
          const limit = item.item_limit;
          const remaining = limit !== null ? Math.max(0, limit - claimed) : null;
          const isFull = limit !== null && claimed >= limit;
          const isExpanded = expandedItem === item.id;
          const sectionKey = (item.section ?? "").trim();
          const prevKey = idx > 0 ? (arr[idx - 1].section ?? "").trim() : "";
          const showHeader = sectionKey !== "" && sectionKey !== prevKey;

          return (
            <Fragment key={item.id}>
            {showHeader && (
              <div className="pt-3 first:pt-0">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.4px] text-[#5A8399] px-1">
                  {sectionKey}
                </h3>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
              <div className="p-5 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] text-[#0D2B35] leading-snug">{item.label}</div>
                  <div className="text-xs text-[#5A8399] mt-0.5">
                    {isFull
                      ? `Full, ${claimed} claimed`
                      : limit !== null
                      ? `${claimed} of ${limit} claimed`
                      : claimed > 0
                      ? `${claimed} claimed`
                      : "No one yet. Be first!"}
                  </div>
                </div>
                {!isFull && (
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedItem(isExpanded ? null : item.id);
                      setItemError("");
                    }}
                    className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all flex-shrink-0 ${
                      isExpanded
                        ? "bg-[#F4FAFB] text-[#5A8399] border border-[rgba(14,150,176,0.22)]"
                        : "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.3)] hover:-translate-y-0.5"
                    }`}
                  >
                    {isExpanded ? "Cancel" : "Claim"}
                  </button>
                )}
                {isFull && (
                  <span className="text-xs font-semibold text-[#5A8399] bg-[#F4FAFB] px-3 py-1.5 rounded-xl border border-[rgba(14,150,176,0.14)] flex-shrink-0">
                    Full
                  </span>
                )}
              </div>

              {showSignupsPublicly && item.item_signups.length > 0 && (
                <div className="border-t border-[#0E96B0]/10 px-5 py-3">
                  <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-2">
                    Also signed up
                  </div>
                  <div className="space-y-1">
                    {item.item_signups.map((sig) => (
                      <div key={sig.id} className="text-xs text-[#2E5566]">
                        <span className="font-medium">{sig.member_name}</span>
                        {sig.signup_note && (
                          <span className="text-[#5A8399]"> — {sig.signup_note}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div className="border-t border-[#0E96B0]/10 bg-[#F4FAFB] px-5 py-4">
                  {itemError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl mb-3 text-sm">
                      {itemError}
                    </div>
                  )}
                  <form onSubmit={(e) => handleItemSignup(e, item.id)} onFocusCapture={() => trackFormStarted("item")} className="space-y-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                        How many?
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setItemFormData((prev) => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                          disabled={itemSubmitting || itemFormData.quantity <= 1}
                          aria-label="Decrease quantity"
                          className="w-9 h-9 flex items-center justify-center rounded-lg border-[1.5px] border-[rgba(14,150,176,0.22)] bg-white text-[#0E96B0] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >−</button>
                        <input
                          type="number"
                          min={1}
                          max={remaining ?? undefined}
                          value={itemFormData.quantity}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            const next = Number.isFinite(n) && n > 0 ? n : 1;
                            setItemFormData((prev) => ({ ...prev, quantity: remaining !== null ? Math.min(next, remaining) : next }));
                          }}
                          aria-label="Quantity"
                          className="w-16 text-center text-sm text-[#0D2B35] px-2 py-2 border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-lg bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          disabled={itemSubmitting}
                        />
                        <button
                          type="button"
                          onClick={() => setItemFormData((prev) => ({ ...prev, quantity: remaining !== null ? Math.min(remaining, prev.quantity + 1) : prev.quantity + 1 }))}
                          disabled={itemSubmitting || (remaining !== null && itemFormData.quantity >= remaining)}
                          aria-label="Increase quantity"
                          className="w-9 h-9 flex items-center justify-center rounded-lg border-[1.5px] border-[rgba(14,150,176,0.22)] bg-white text-[#0E96B0] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >+</button>
                        {remaining !== null && (
                          <span className="text-[11px] text-[#5A8399] ml-1">{remaining} left</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                        Your name *
                      </label>
                      <input
                        type="text"
                        value={itemFormData.name}
                        onChange={(e) => setItemFormData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="First and last name"
                        required
                        className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        disabled={itemSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                        Email <span className="font-normal text-[#5A8399]">(optional)</span>
                      </label>
                      <input
                        type="email"
                        value={itemFormData.email}
                        onChange={(e) => setItemFormData((prev) => ({ ...prev, email: e.target.value }))}
                        onBlur={(e) => trackEmailEntered("item", e.target.value)}
                        placeholder="you@example.com"
                        className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        disabled={itemSubmitting}
                      />
                      <EmailTypoHint email={itemFormData.email} onAccept={(fixed) => setItemFormData((prev) => ({ ...prev, email: fixed }))} />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                        Note <span className="font-normal text-[#5A8399]">(optional)</span>
                      </label>
                      <textarea
                        value={itemFormData.note}
                        onChange={(e) => setItemFormData((prev) => ({ ...prev, note: e.target.value }))}
                        placeholder="e.g. I'll bring scrambled eggs and orange juice"
                        rows={2}
                        className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                        disabled={itemSubmitting}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={itemSubmitting}
                      className="w-full text-sm font-semibold py-[11px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-default disabled:translate-y-0"
                    >
                      {itemSubmitting ? "Saving…" : "Confirm"}
                    </button>
                  </form>
                </div>
              )}
            </div>
            </Fragment>
          );
        })
      )}

      {/* Custom write-in: "I'm also bringing…" */}
      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#0E96B0]/8">
          <div className="font-semibold text-[15px] text-[#0D2B35]">I&apos;m also bringing…</div>
          <div className="text-xs text-[#5A8399] mt-0.5">
            Got something not on the list? Add it here so the organizer knows.
          </div>
        </div>
        {showSignupsPublicly && customSignups.length > 0 && (
          <div className="px-5 py-3 border-b border-[#0E96B0]/8 space-y-1">
            {customSignups.map((sig) => (
              <div key={sig.id} className="text-xs text-[#2E5566]">
                <span className="font-medium">{sig.member_name}</span>
                <span className="text-[#5A8399]"> — {sig.custom_label}</span>
                {sig.signup_note && <span className="text-[#5A8399]"> · {sig.signup_note}</span>}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleCustomItemSignup} onFocusCapture={() => trackFormStarted("custom_item")} className="px-5 py-4 space-y-3 bg-[#F4FAFB]">
          {customError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">{customError}</div>
          )}
          <div>
            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">What will you bring? *</label>
            <input
              type="text"
              value={customItem.label}
              onChange={(e) => setCustomItem((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. a trailer, a generator, extra chairs"
              maxLength={200}
              className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
              disabled={customSubmitting}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">Your name *</label>
            <input
              type="text"
              value={customItem.name}
              onChange={(e) => setCustomItem((p) => ({ ...p, name: e.target.value }))}
              placeholder="First and last name"
              className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
              disabled={customSubmitting}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">Note <span className="font-normal text-[#5A8399]">(optional)</span></label>
            <input
              type="text"
              value={customItem.note}
              onChange={(e) => setCustomItem((p) => ({ ...p, note: e.target.value }))}
              placeholder="Any details the organizer should know"
              className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
              disabled={customSubmitting}
            />
          </div>
          <button
            type="submit"
            disabled={customSubmitting || !customItem.label.trim() || !customItem.name.trim()}
            className="w-full text-sm font-semibold py-[11px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-default disabled:translate-y-0"
          >
            {customSubmitting ? "Adding…" : "Add my contribution"}
          </button>
        </form>
      </div>
    </div>
  )
  );
}
