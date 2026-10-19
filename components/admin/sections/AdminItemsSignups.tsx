"use client";

import SignupOptionsMenu from "@/components/SignupOptionsMenu";
import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Item signups and custom item signups for items events. */
export default function AdminItemsSignups({ ctx }: { ctx: AdminEventView }) {
  const {
    customSignups,
    eventType,
    items,
    menuButtonRefs,
    openMenuButton,
    openMenuSignupId,
    setOpenMenuButton,
    setOpenMenuSignupId,
    showConfirmRemove,
  } = ctx;

  return (
    eventType === "items" && (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
          <p className="text-sm text-[#5A8399]">No items added yet.</p>
        </div>
      ) : (
        items.map((item) => {
          const claimed = (item.item_signups ?? []).reduce((s, r) => s + ((r as { quantity?: number }).quantity ?? 1), 0);
          const limit = item.item_limit;
          const isFull = limit !== null && claimed >= limit;
          return (
            <div key={item.id} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between gap-3">
                <div className="font-semibold text-[15px] text-[#0D2B35] leading-snug">{item.label}</div>
                <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isFull ? "bg-[#edfaf4] text-[#1D9E75]" : claimed === 0 ? "bg-[#F4FAFB] text-[#5A8399]" : "bg-[#fdf6ec] text-[#d97706]"
                }`}>
                  {claimed}{limit !== null ? `/${limit}` : ""} claimed
                </span>
              </div>
              {claimed === 0 ? (
                <div className="px-5 py-4 text-xs text-[#5A8399] italic">No one yet</div>
              ) : (
                <div className="px-5 py-3 space-y-1.5">
                  {item.item_signups.map((sig) => (
                    <div key={sig.id} className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
                      <div className="flex items-start gap-2 pr-10">
                        <div className="w-5 h-5 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-[#0D2B35] font-medium">{sig.member_name}</span>
                          {((sig as { quantity?: number }).quantity ?? 1) > 1 && (
                            <span className="text-xs font-semibold text-[#08647E] bg-[#E6F7FB] border border-[rgba(14,150,176,0.22)] rounded-full px-2 py-0.5 ml-2">
                              ×{(sig as { quantity?: number }).quantity}
                            </span>
                          )}
                          {sig.member_email && <span className="text-xs text-[#5A8399] ml-2">{sig.member_email}</span>}
                          {sig.signup_note && (
                            <p className="text-xs text-[#5A8399] mt-0.5 leading-snug">{sig.signup_note}</p>
                          )}
                        </div>
                      </div>
                      <button
                        ref={(el) => { if (el) menuButtonRefs.current.set(sig.id, el); }}
                        type="button"
                        onClick={(e) => { setOpenMenuButton(e.currentTarget); setOpenMenuSignupId(sig.id); }}
                        aria-label={`Options for ${sig.member_name}`}
                        className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                      {openMenuSignupId === sig.id && (
                        <SignupOptionsMenu
                          memberName={sig.member_name}
                          contextLabel={item.label}
                          onRemove={() => showConfirmRemove(sig.id, sig.member_name, item.label, true)}
                          onClose={() => {
                            setOpenMenuSignupId(null);
                            menuButtonRefs.current.get(sig.id)?.focus();
                          }}
                          buttonElement={openMenuButton}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {customSignups.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white">
            <div className="font-semibold text-[15px] text-[#0D2B35]">Also bringing (write-ins)</div>
            <div className="text-xs text-[#5A8399] mt-0.5">Items attendees added that weren&apos;t on your list.</div>
          </div>
          <div className="px-5 py-3 space-y-1.5">
          {customSignups.map((sig) => (
            <div key={sig.id} className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
              <div className="flex items-start gap-2 pr-10">
                <div className="w-5 h-5 rounded-full bg-[#FFF4E5] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[#0D2B35] font-medium">{sig.custom_label}</span>
                  <span className="text-xs text-[#5A8399]"> · {sig.member_name}</span>
                  {sig.member_email && <span className="text-xs text-[#5A8399] ml-1">({sig.member_email})</span>}
                  {sig.signup_note && <p className="text-xs text-[#5A8399] mt-0.5 leading-snug">{sig.signup_note}</p>}
                </div>
              </div>
              <button
                ref={(el) => { if (el) menuButtonRefs.current.set(sig.id, el); }}
                type="button"
                onClick={(e) => { setOpenMenuButton(e.currentTarget); setOpenMenuSignupId(sig.id); }}
                aria-label={`Options for ${sig.member_name}`}
                className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {openMenuSignupId === sig.id && (
                <SignupOptionsMenu
                  memberName={sig.member_name}
                  contextLabel={sig.custom_label || "custom item"}
                  onRemove={() => showConfirmRemove(sig.id, sig.member_name, sig.custom_label || "custom item", true)}
                  onClose={() => {
                    setOpenMenuSignupId(null);
                    menuButtonRefs.current.get(sig.id)?.focus();
                  }}
                  buttonElement={openMenuButton}
                />
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
  );
}
