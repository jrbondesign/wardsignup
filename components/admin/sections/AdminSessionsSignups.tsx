"use client";

import { formatSessionDate, formatSlotLabel, orderSessionsBySection } from "@/components/admin/admin-page-shared";
import Link from "next/link";
import { Fragment } from "react";
import { formatTime } from "@/lib/utils";
import SignupOptionsMenu from "@/components/SignupOptionsMenu";
import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Sessions grouped by day with their signups. */
export default function AdminSessionsSignups({ ctx }: { ctx: AdminEventView }) {
  const {
    eventId,
    eventType,
    groupedSessions,
    hasSessionDates,
    menuButtonRefs,
    openMenuButton,
    openMenuSignupId,
    setOpenMenuButton,
    setOpenMenuSignupId,
    showConfirmRemove,
  } = ctx;

  return (
    (eventType === "spots" || eventType === "rsvp") && Object.keys(groupedSessions).length === 0 ? (
    <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
      <p className="text-sm text-[#5A8399]">No slots yet.</p>
    </div>
  ) : (eventType === "spots" || eventType === "rsvp") && (
    <div className="space-y-4">
      {Object.entries(groupedSessions).map(([day, daySessions]) => {
        const orderedSessions = orderSessionsBySection(daySessions);

        return (
          <div key={day} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
            {/* Day header */}
            <div className="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between gap-3">
              <h2 className="font-serif text-xl text-[#0D2B35]">
                {hasSessionDates && /^\d{4}-\d{2}-\d{2}$/.test(day)
                  ? (() => { const [y,m,d2] = day.split("-").map(Number); return new Date(y, m-1, d2).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); })()
                  : day}
              </h2>
              <Link
                href={/^\d{4}-\d{2}-\d{2}$/.test(day) ? `/edit/${eventId}#edit-date-${day}` : `/edit/${eventId}`}
                className="inline-flex flex-shrink-0 items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border-[1.5px] border-[#0E96B0]/35 text-[#08647E] bg-white hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all no-underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </Link>
            </div>

            <div className="p-6 space-y-3">
              {orderedSessions.map((session, sIdx, sArr) => {
                const filled = session.signups?.length || 0;
                const isFull = filled >= session.capacity;
                const sectionKey = (session.section ?? "").trim();
                const prevKey = sIdx > 0 ? (sArr[sIdx - 1].section ?? "").trim() : "";
                const showHeader = sectionKey !== "" && sectionKey !== prevKey;

                return (
                  <Fragment key={session.id}>
                    {showHeader && (
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399] px-1 pt-3 first:pt-0">
                        {sectionKey}
                      </h3>
                    )}
                    <div className="border border-[#0E96B0]/12 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <div id={`slot-heading-${session.id}`} className="text-sm font-semibold text-[#0D2B35]">
                            {session.label || (
                              <>
                                {formatTime(session.time)}
                                {session.end_time && ` – ${formatTime(session.end_time)}`}
                              </>
                            )}
                            {session.location && (
                              <span className="text-[#5A8399] font-normal"> · {session.location}</span>
                            )}
                          </div>
                          {session.label && (
                            <div className="text-xs text-[#5A8399] mt-0.5">
                              {formatTime(session.time)}
                              {session.end_time && ` – ${formatTime(session.end_time)}`}
                            </div>
                          )}
                          {session.notes && (
                            <div className="text-xs text-[#5A8399] mt-0.5">{session.notes}</div>
                          )}
                        </div>
                        <span className={`flex-shrink-0 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${
                          isFull
                            ? "bg-[#edfaf4] text-[#1D9E75]"
                            : "bg-[#fdf6ec] text-[#d97706]"
                        }`}>
                          {session.capacity >= 999
                            ? `${filled} signed up`
                            : `${filled}/${session.capacity} filled`}
                        </span>
                      </div>

                      {session.session_date && (
                        <div className="mb-3">
                          <span className="inline-block bg-[#E6F7FB] text-[#0E96B0] px-2.5 py-1 rounded-lg text-xs font-medium">
                            {formatSessionDate(session.session_date, true)}
                          </span>
                        </div>
                      )}

                      {/* Signups */}
                      <div className="mt-3 pt-3 border-t border-[#0E96B0]/8">
                        <div className="text-xs font-semibold text-[#2E5566] mb-2 uppercase tracking-[0.5px]">Signed Up</div>
                        {session.signups?.length ? (
                          <div className="space-y-1.5">
                            {session.signups.map((signup) => (
                              <div key={signup.id} className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
                                <div className="flex items-start gap-2 pr-10">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-[#0D2B35]">{signup.member_name}</div>
                                    {/* Guest names indented below registrant */}
                                    {(signup as any).guest_names?.length > 0 && (
                                      <div className="mt-1 space-y-0.5">
                                        {((signup as any).guest_names as string[]).map((gn: string, gi: number) => (
                                          <div key={gi} className="text-xs text-[#5A8399] flex items-center gap-1.5 pl-2">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-[#0E96B0]/60 flex-shrink-0">
                                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                            </svg>
                                            {gn}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {(signup.member_email || signup.member_phone) && (
                                      <div className="text-xs text-[#5A8399] mt-0.5 space-y-0.5">
                                        {signup.member_email && <div>{signup.member_email}</div>}
                                        {signup.member_phone && <div>{signup.member_phone}</div>}
                                      </div>
                                    )}
                                    {(signup as any).signup_note && (
                                      <p className="text-xs text-[#5A8399] mt-0.5 leading-snug italic">"{(signup as any).signup_note}"</p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  ref={(el) => { if (el) menuButtonRefs.current.set(signup.id, el); }}
                                  type="button"
                                  onClick={(e) => { setOpenMenuButton(e.currentTarget); setOpenMenuSignupId(signup.id); }}
                                  aria-label={`Options for ${signup.member_name}`}
                                  className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <circle cx="12" cy="5" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="12" cy="19" r="2" />
                                  </svg>
                                </button>
                                {openMenuSignupId === signup.id && (
                                  <SignupOptionsMenu
                                    memberName={signup.member_name}
                                    contextLabel={
                                      session.section
                                        || session.label
                                        || formatSlotLabel(session)
                                    }
                                    onRemove={() => showConfirmRemove(
                                      signup.id,
                                      signup.member_name,
                                      session.section
                                        || session.label
                                        || formatSlotLabel(session),
                                      false
                                    )}
                                    onClose={() => {
                                      setOpenMenuSignupId(null);
                                      menuButtonRefs.current.get(signup.id)?.focus();
                                    }}
                                    buttonElement={openMenuButton}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-[#5A8399] italic">No signups yet</div>
                        )}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  )
  );
}
