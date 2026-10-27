"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";

/** Settings link that lands with the Ward/Unit field focused. */
export const WARD_SETTINGS_HREF = "/settings/organization?focus=ward";
export const ADD_WARD_LABEL = "Add your ward";

interface Props {
  /** organizations.ward_name; null or blank shows "+ Add your ward"; undefined means still loading. */
  wardName: string | null | undefined;
}

const lineClass =
  "max-w-full w-fit text-[15px] font-medium leading-5 text-[#2B7F86] hover:text-[#08647E] no-underline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]";

/**
 * Ward line above the dashboard org name: the ward (organizations.ward_name)
 * in teal, or "+ Add your ward" when it is empty. Either one opens Organization
 * settings with Ward/Unit focused. Display only; calling never shows here.
 */
export default function OrgWardLine({ wardName }: Props) {
  const posthog = usePostHog();
  const ward = typeof wardName === "string" ? wardName.trim() : wardName;

  // Hold the line's height while loading so the title doesn't jump.
  if (ward === undefined) {
    return <div data-testid="org-ward-placeholder" aria-hidden="true" className="h-5 mb-1.5" />;
  }

  const onClick = () =>
    posthog?.capture("org_settings_opened", { source: "dashboard_ward_line", ward_set: Boolean(ward) });

  if (ward) {
    return (
      <Link
        href={WARD_SETTINGS_HREF}
        onClick={onClick}
        title={ward}
        aria-label={`${ward}, edit ward in Organization settings`}
        data-testid="org-ward-line"
        className={`${lineClass} block truncate mb-1.5`}
      >
        {ward}
      </Link>
    );
  }

  return (
    <Link
      href={WARD_SETTINGS_HREF}
      onClick={onClick}
      data-testid="org-ward-add"
      className={`${lineClass} flex items-center gap-1.5 mb-1.5`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
        className="w-3.5 h-3.5 flex-none"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      {ADD_WARD_LABEL}
    </Link>
  );
}
