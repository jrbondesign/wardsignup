"use client";

import { CREATOR_REMINDERS_NOTE, showCreatorRemindersNote } from "@/lib/reminder-copy";

interface CreatorRemindersNoteProps {
  /** True only once the viewer is confirmed as the creator or a manager. */
  viewerCanManage: boolean;
  eventType: string;
}

/** Short note for creators and managers that reminder emails are automatic.
 *  Renders nothing for anyone else. */
export default function CreatorRemindersNote({ viewerCanManage, eventType }: CreatorRemindersNoteProps) {
  if (!showCreatorRemindersNote(viewerCanManage, eventType)) return null;
  return (
    <p className="mt-2 px-1 text-[11px] text-[#5A8399] leading-snug flex items-start gap-1.5" data-testid="creator-reminders-note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 mt-px flex-shrink-0 text-[#0E96B0]" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span>{CREATOR_REMINDERS_NOTE}</span>
    </p>
  );
}
