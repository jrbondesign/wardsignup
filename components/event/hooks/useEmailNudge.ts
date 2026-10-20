"use client";

import { useRef, useState } from "react";

/**
 * UI state for the email nudge experiment (lib/email-nudge.ts): whether the
 * card is open, how many times it showed in this signup, and the email field
 * that "Add email" focuses (shared by the inline form and the modal).
 */
export function useEmailNudge() {
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const nudgeShownRef = useRef(0);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  return { nudgeOpen, setNudgeOpen, nudgeShownRef, emailInputRef };
}

export type EmailNudgeState = ReturnType<typeof useEmailNudge>;
