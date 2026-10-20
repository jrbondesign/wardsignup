"use client";

import { useBrand } from "@/components/BrandProvider";
import { usePostHog } from "posthog-js/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePublicCover, type PublicCover } from "@/lib/use-public-cover";
import type { PublicEventPageData } from "@/lib/public-event-page";
import { SessionWithSignups } from "@/components/event/event-page-shared";
import { type CampaignItemWithSignups } from "@/lib/types";

export interface EventPageInit {
  /** Server loaded data: object = loaded, null = no such event, undefined = load in the browser. */
  initialPage?: PublicEventPageData | null;
  /** Server loaded cover: object = show, null = none, undefined = fetch in the browser. */
  initialCover?: PublicCover | null;
}

/** State for the public event signup page. */
export function useEventPageState(eventId: string, init: EventPageInit = {}) {
  const brand = useBrand();
  const posthog = usePostHog();
  const router = useRouter();
  const page = init.initialPage;
  const publicCover = usePublicCover(eventId, init.initialCover);
  const [event, setEvent] = useState<any>(page?.event ?? null);
  const [sessions, setSessions] = useState<SessionWithSignups[]>(page?.sessions ?? []);
  const [loading, setLoading] = useState(page === undefined);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", note: "" });
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [eventType, setEventType] = useState<"spots" | "items" | "rsvp">(page?.eventType ?? "spots");
  const [items, setItems] = useState<CampaignItemWithSignups[]>(page?.items ?? []);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [itemFormData, setItemFormData] = useState({ name: "", email: "", note: "", quantity: 1 });
  const [customItem, setCustomItem] = useState({ label: "", name: "", note: "" });
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState("");
  const [customSignups, setCustomSignups] = useState<{ id: string; member_name: string; custom_label: string | null; signup_note: string | null; quantity: number }[]>(page?.customSignups ?? []);
  const [showSignupsPublicly, setShowSignupsPublicly] = useState(Boolean(page?.event.show_signups_publicly));
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemError, setItemError] = useState("");
  const [itemSuccess, setItemSuccess] = useState(false);
  // Both default true when the event leaves them null.
  const [allowGuests, setAllowGuests] = useState(page?.event.allow_guests == null ? true : Boolean(page.event.allow_guests));
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(
    page?.event.show_capacity_publicly == null ? true : Boolean(page.event.show_capacity_publicly)
  );
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<{ day: number; year: number; month: number } | null>(null);

  return {
    brand,
    posthog,
    router,
    eventId,
    publicCover,
    event,
    setEvent,
    sessions,
    setSessions,
    loading,
    setLoading,
    selectedSessions,
    setSelectedSessions,
    showSignupForm,
    setShowSignupForm,
    formData,
    setFormData,
    guestNames,
    setGuestNames,
    submitting,
    setSubmitting,
    error,
    setError,
    success,
    setSuccess,
    eventType,
    setEventType,
    items,
    setItems,
    expandedItem,
    setExpandedItem,
    itemFormData,
    setItemFormData,
    customItem,
    setCustomItem,
    customSubmitting,
    setCustomSubmitting,
    customError,
    setCustomError,
    customSignups,
    setCustomSignups,
    showSignupsPublicly,
    setShowSignupsPublicly,
    itemSubmitting,
    setItemSubmitting,
    itemError,
    setItemError,
    itemSuccess,
    setItemSuccess,
    allowGuests,
    setAllowGuests,
    showCapacityPublicly,
    setShowCapacityPublicly,
    viewMode,
    setViewMode,
    calendarMonth,
    setCalendarMonth,
    selectedCalendarDate,
    setSelectedCalendarDate,
  };
}

export type EventPageState = ReturnType<typeof useEventPageState>;
