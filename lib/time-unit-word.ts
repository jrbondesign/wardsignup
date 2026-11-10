import type { TemplateKey } from "@/lib/event-template-data";

/**
 * The word an event uses for one of its times, from its template, so copy next
 * to time fields never says "slot":
 * appointment for tithing and interviews, shift for cleaning, service and
 * meals, session for class style events, and time as the fallback.
 */
export type TimeUnitWord = "appointment" | "shift" | "session" | "time";

const BY_TEMPLATE: Partial<Record<TemplateKey, TimeUnitWord>> = {
  "tithing-declaration": "appointment",
  interviews: "appointment",
  "cleaning-crew": "shift",
  "service-day": "shift",
  "service-project": "shift",
  "moving-help": "shift",
  "missionary-dinners": "shift",
};

export function timeUnitWordForTemplate(key: TemplateKey | null | undefined): TimeUnitWord {
  return (key && BY_TEMPLATE[key]) || "time";
}

/**
 * Events don't store their template after create, so edit and admin pages infer
 * the word from what they do know: an appointment window (tithing style
 * schedule), the event type, and keywords in the event name. Heuristic only.
 */
export function inferTimeUnitWord(args: {
  name?: string | null;
  eventType?: string | null;
  isAppointmentWindow?: boolean;
}): TimeUnitWord {
  if (args.isAppointmentWindow) return "appointment";
  const name = (args.name ?? "").toLowerCase();
  if (/\b(tithing|declaration|interview|interviews|appointment|appointments)\b/.test(name)) return "appointment";
  if (/\b(clean|cleaning|service|dinner|dinners|meal|meals|moving|shift|shifts|help)\b/.test(name)) return "shift";
  if (/\b(class|classes|lesson|lessons|session|sessions|workshop|course)\b/.test(name)) return "session";
  return "time";
}
