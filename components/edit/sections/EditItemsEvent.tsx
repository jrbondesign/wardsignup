"use client";

import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Link from "next/link";
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";
import { COVER_SIZE_HINT, coverObjectPosition } from "@/lib/cover-position";
import EventDatesPicker from "@/components/create/EventDatesPicker";
import TimeInput from "@/components/TimeInput";
import ItemsSection from "@/components/create/sections/ItemsSection";
import { INITIAL_FORM_STATE } from "@/lib/create-form-state";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Editor for items (potluck-style) events. */
export default function EditItemsEvent({ ctx }: { ctx: EditEventCtx }) {
  const {
    coverPosition,
    coverPreview,
    coverUploading,
    coverUrl,
    eventDescription,
    eventId,
    eventName,
    handleCoverChange,
    handleCoverRemove,
    handleSaveItems,
    itemsApproximateTime,
    itemsError,
    itemsEventDates,
    itemsEventEndTime,
    itemsEventStartTime,
    itemsList,
    itemsSaving,
    optionalSettingsEl,
    organizationId,
    setEventDescription,
    setEventName,
    setItemsApproximateTime,
    setItemsError,
    setItemsEventDates,
    setItemsEventEndTime,
    setItemsEventStartTime,
    setItemsList,
  } = ctx;

  const filledItems = itemsList.filter((it) => it.label.trim());
  return (
    <>
      <Navigation />
      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[12px] border-t border-[rgba(14,150,176,0.14)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[#0D2B35]">{filledItems.length} item{filledItems.length !== 1 ? "s" : ""}</div>
            <div className="text-xs text-[#5A8399]">Save to update your event</div>
          </div>
          <button onClick={handleSaveItems} disabled={itemsSaving}
            className={`text-sm font-semibold px-5 py-2.5 rounded-xl text-white border-none cursor-pointer shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all flex items-center gap-2 ${itemsSaving ? "bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] cursor-default" : "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] hover:-translate-y-0.5"}`}>
            {itemsSaving ? <><LoadingSpinner size="xs" className="border-white/25 border-t-white" />Saving…</> : <>Save Changes <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></>}
          </button>
        </div>
      </div>
      <main className="min-h-screen bg-[#F4FAFB] p-4 md:p-8 pb-28">
        <div className="max-w-2xl mx-auto">
          <Link href={`/admin/${eventId}`} replace className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] mb-5 transition-colors no-underline">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to event
          </Link>
          {itemsError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm">{itemsError}</div>}
          {/* Event details */}
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden mb-4">
            <div className="p-4 md:p-8">
              {isCoverImageEnabledForOrg(organizationId) && (
              <div className="relative">
                <label className="cursor-pointer group block">
                  <div className="w-full aspect-[2/1] relative overflow-hidden bg-[#F4FAFB] flex items-center justify-center">
                    {coverUploading ? (
                      <LoadingSpinner size="lg" />
                    ) : (coverPreview || coverUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverPreview ?? coverUrl!} alt="Event cover" className="w-full h-full object-cover" style={{ objectPosition: coverPreview ? undefined : coverObjectPosition(coverPosition) }} />
                    ) : (
                      <div className="text-center text-[#5A8399] px-4">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto mb-2 opacity-30">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <p className="text-sm font-medium opacity-50">Add a cover image</p>
                        <p className="text-xs opacity-40 mt-1">1600 × 800 px recommended (2:1) · JPEG, PNG, or WebP · max 20 MB</p>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-semibold bg-black/50 px-3 py-1.5 rounded-lg">
                        {coverUrl || coverPreview ? "Replace cover image" : "Upload cover image"}
                      </span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleCoverChange}
                    disabled={coverUploading || itemsSaving}
                  />
                </label>
                {(coverUrl || coverPreview) && !coverUploading && (
                  <button
                    type="button"
                    onClick={handleCoverRemove}
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                    title="Remove cover image"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
              )}
              <p className="mt-2 text-[11px] text-[#7A9BAE] leading-relaxed">
                {COVER_SIZE_HINT.replace("Drag to reposition", "Reposition it from the event page")}
              </p>
            </div>
              )}
            <div className="flex items-center gap-3 mb-6">
              {/* Future: Org logo support */}
              <h1 className="font-serif text-[28px] text-[#0D2B35]">Edit Event</h1>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Event Name *</label>
                <input type="text" value={eventName} onChange={(e) => { setEventName(e.target.value); setItemsError(""); }} placeholder="e.g., Spring Potluck 2026"
                  className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                  disabled={itemsSaving} required />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Description <span className="font-normal text-[#5A8399]">(optional)</span></label>
                <textarea value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} placeholder="Add details about this event…" rows={3}
                  className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                  disabled={itemsSaving} />
              </div>
              <div>
                <p className="text-[12px] text-[#5A8399] mb-2">Leave blank if the date is still TBD.</p>
                <EventDatesPicker
                  dates={itemsEventDates}
                  onChange={(dates) => { setItemsEventDates(dates); setItemsError(""); }}
                />
                {itemsEventDates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItemsEventDates([])}
                    className="mt-2 text-[12px] font-medium text-[#0E96B0] hover:text-[#08647E] transition-colors"
                    disabled={itemsSaving}
                  >
                    Clear all dates
                  </button>
                )}
              </div>
              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer mb-2 select-none">
                  <input type="checkbox" checked={itemsApproximateTime}
                    onChange={(e) => setItemsApproximateTime(e.target.checked)}
                    className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
                    disabled={itemsSaving} />
                  <span className="text-[12px] font-medium text-[#2E5566]">
                    Approximate time <span className="text-[#5A8399] font-normal">(use plain text like &quot;around 9–10am&quot;)</span>
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Start Time <span className="font-normal text-[#5A8399]">(optional)</span></label>
                    {itemsApproximateTime ? (
                      <input type="text" value={itemsEventStartTime}
                        onChange={(e) => { setItemsEventStartTime(e.target.value); setItemsError(""); }}
                        placeholder="e.g. around 9am" maxLength={100}
                        className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        disabled={itemsSaving} />
                    ) : (
                      <TimeInput value={itemsEventStartTime}
                        onChange={(v) => { setItemsEventStartTime(v); setItemsError(""); }}
                        disabled={itemsSaving}
                        className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">End Time <span className="font-normal text-[#5A8399]">(optional)</span></label>
                    {itemsApproximateTime ? (
                      <input type="text" value={itemsEventEndTime}
                        onChange={(e) => { setItemsEventEndTime(e.target.value); setItemsError(""); }}
                        placeholder="e.g. by lunchtime" maxLength={100}
                        className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        disabled={itemsSaving} />
                    ) : (
                      <TimeInput value={itemsEventEndTime}
                        onChange={(v) => { setItemsEventEndTime(v); setItemsError(""); }}
                        placeholder="e.g. 5pm"
                        disabled={itemsSaving}
                        className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Items */}
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-4 md:p-8">
            <h2 className="font-serif text-[22px] text-[#0D2B35] mb-2">Items</h2>
            <p className="text-[15px] text-[#5A8399] mb-7">List the things people can claim — a dish to bring, a job to do, anything goes. Each item is Unlimited by default; switch to a numeric cap to limit signups.</p>
            <ItemsSection
              state={{
                ...INITIAL_FORM_STATE,
                eventType: "items",
                items: itemsList,
              }}
              set={(patch) => {
                if (patch.items) {
                  setItemsList(patch.items);
                  setItemsError("");
                }
              }}
            />
            <div className="mt-4 mb-6" />
            <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-[18px] py-[14px] text-sm leading-relaxed text-[#2E5566] mb-6">
              <strong className="text-[#0D2B35] font-semibold">Tip:</strong>{" "}Press <kbd className="bg-white border border-[rgba(14,150,176,0.22)] rounded px-1 py-0.5 text-xs font-mono">Enter</kbd> in any item field to quickly add the next row.
            </div>
            {optionalSettingsEl("items", false)}
          </div>
          </div>{/* end p-4 md:p-8 */}
        </div>
      </main>
    </>
  );
}
