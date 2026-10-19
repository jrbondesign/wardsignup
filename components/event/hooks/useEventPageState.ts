"use client";

import { useBrand } from "@/components/BrandProvider";
import { usePostHog } from "posthog-js/react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { usePublicCover } from "@/lib/use-public-cover";
import { SessionWithSignups } from "@/components/event/event-page-shared";
import { type CampaignItemWithSignups } from "@/lib/types";

/** State for the public event signup page. */
export function useEventPageState(params: Promise<{ id: string }>) {
  const brand = useBrand();
  const posthog = usePostHog();
  const router = useRouter();
  const { id: eventId } = use(params);
  const publicCover = usePublicCover(eventId);
  const [event, setEvent] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionWithSignups[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", note: "" });
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [eventType, setEventType] = useState<"spots" | "items" | "rsvp">("spots");
  const [items, setItems] = useState<CampaignItemWithSignups[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [itemFormData, setItemFormData] = useState({ name: "", email: "", note: "", quantity: 1 });
  const [customItem, setCustomItem] = useState({ label: "", name: "", note: "" });
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState("");
  const [customSignups, setCustomSignups] = useState<{ id: string; member_name: string; custom_label: string | null; signup_note: string | null; quantity: number }[]>([]);
  const [showSignupsPublicly, setShowSignupsPublicly] = useState(false);
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemError, setItemError] = useState("");
  const [itemSuccess, setItemSuccess] = useState(false);
  const [allowGuests, setAllowGuests] = useState(true);
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(true);
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
