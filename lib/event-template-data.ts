/**
 * Canonical event template data.
 * Single source of truth used by the create page, dashboard, and any future surfaces.
 *
 * Each template may declare a `brands` allowlist; callers filter via
 * getTemplatesForBrand(). The current built-in set is Ward/LDS-specific copy, so every
 * template is scoped to "wardsignup". Brand-neutral templates can omit `brands`
 * (= available everywhere) or set their own allowlist.
 */

import type { EventType } from "@/lib/types";
import type { BrandId } from "@/lib/brand/types";

export type TemplateKey =
  | "fathers-sons"
  | "service-day"
  | "fireside"
  | "temple-trip"
  | "missionary-dinners"
  | "tithing-declaration"
  | "cleaning-crew"
  | "interviews"
  | "ward-potluck"
  | "service-project"
  | "moving-help";

export type EventCategory = "single" | "sessions" | "bring";

/** Maps EventCategory to the underlying event_type stored in the DB. */
export const CATEGORY_EVENT_TYPE: Record<EventCategory, EventType> = {
  single:   "rsvp",
  sessions: "spots",
  bring:    "items",
};

export interface EventTemplate {
  key: TemplateKey;
  /** Emoji icon */
  icon: string;
  /** Short display name */
  label: string;
  /** One-liner shown on template cards */
  desc: string;
  /** Which event category this belongs to */
  catId: EventCategory;
  /** Human-readable category label */
  catLabel: string;
  /** Tailwind classes for the badge on the create page (bg + text + border) */
  badgeColor: string;
  /** Tailwind text-color class for the category label on dashboard chips */
  catTextColor: string;
  /** Pre-filled event name when the template form opens */
  defaultName: string;
  /** Pre-filled event description when the template form opens */
  defaultDescription: string;
  /** Whether allow_guests defaults to ON for this template (overrides category default) */
  allowGuestsDefault?: boolean;
  /** Whether show_capacity_publicly defaults to ON (defaults to true everywhere) */
  showCapacityDefault?: boolean;
  /** Whether the max attendees toggle should be ON by default */
  hasCapacityDefault?: boolean;
  /** Default capacity value when hasCapacityDefault is true */
  defaultCapacity?: number;
  /** When true, always create exactly 1 signup slot even for multi-day date ranges.
   *  Use for events where capacity is for the whole trip/event, not per-day. */
  singleSessionForEntireEvent?: boolean;
  /** Default items to pre-populate on the setup-items page (bring/do events only) */
  defaultItems?: { label: string; quantity: number }[];
  /** Alternative description used when a dual-mode template switches to RSVP mode */
  defaultDescriptionRsvp?: string;
  /** Brands this template is offered to. Omitted = available to every brand. */
  brands?: BrandId[];
}

// Built-in templates. All carry Ward/LDS-specific copy, so they're tagged
// ward-only below (see EVENT_TEMPLATES). To add a brand-neutral template, give it
// its own `brands` value (or omit it) — the default ward tag only applies to entries
// that don't declare one.
const BUILTIN_TEMPLATES: EventTemplate[] = [
  // ── Most-used (shown in initial grid of 4) ───────────────────────────────
  {
    key: "tithing-declaration",
    icon: "📋",
    label: "Tithing Declaration",
    desc: "Timed family appointments with the Bishop.",
    catId: "sessions",
    catLabel: "Scheduled Sessions",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    catTextColor: "text-violet-600",
    allowGuestsDefault: false,
    defaultName: "Tithing Declaration",
    defaultDescription:
      "Meet with the Bishop to declare your tithing for the year. It's a brief and meaningful moment — we're grateful for your faithfulness.",
  },
  {
    key: "missionary-dinners",
    icon: "🍽",
    label: "Missionary Dinners",
    desc: "One family hosts the missionaries each night.",
    catId: "sessions",
    catLabel: "Scheduled Sessions",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    catTextColor: "text-violet-600",
    allowGuestsDefault: false,
    defaultName: "Missionary Dinners",
    defaultDescription:
      "Open your home to the missionaries for a simple meal and a moment of fellowship. Your warmth and hospitality are a meaningful gift — no elaborate preparation needed.",
  },
  {
    key: "ward-potluck",
    icon: "🥗",
    label: "Ward Potluck",
    desc: "Pre-filled list: main dish, salad, rolls, dessert, drinks.",
    catId: "bring",
    catLabel: "Bring or Do",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    catTextColor: "text-emerald-600",
    allowGuestsDefault: false,
    defaultName: "Ward Potluck",
    defaultDescription:
      "Sign up to bring a dish to our ward potluck! Check what's still needed and claim a spot. There's no wrong answer — everything is appreciated.",
    defaultDescriptionRsvp:
      "Join us for our ward potluck! RSVP so we know how many to expect. Bring your appetite and come ready to enjoy good food and great company.",
    defaultItems: [
      { label: "Main Dish", quantity: 3 },
      { label: "Side Dish / Salad", quantity: 3 },
      { label: "Rolls & Butter", quantity: 2 },
      { label: "Dessert", quantity: 3 },
      { label: "Drinks", quantity: 2 },
      { label: "Paper Plates & Napkins", quantity: 1 },
      { label: "Plastic Utensils", quantity: 1 },
    ],
  },
  {
    key: "cleaning-crew",
    icon: "🧹",
    label: "Cleaning Crew",
    desc: "Recurring weekly shifts with capacity per shift.",
    catId: "sessions",
    catLabel: "Scheduled Sessions",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    catTextColor: "text-violet-600",
    allowGuestsDefault: false,
    defaultName: "Building Cleaning",
    defaultDescription:
      "Sign up for a cleaning shift to help keep our building clean and welcoming. Each shift takes about an hour and makes a real difference.",
  },
  {
    key: "interviews",
    icon: "💬",
    label: "Interviews",
    desc: "One-on-one appointments with Bishop or counselors.",
    catId: "sessions",
    catLabel: "Scheduled Sessions",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    catTextColor: "text-violet-600",
    allowGuestsDefault: false,
    defaultName: "Bishop Interviews",
    defaultDescription:
      "Schedule a time to meet with the Bishop. Appointments are kept confidential. Please arrive a few minutes early.",
  },
  // ── Bring or Do ──────────────────────────────────────────────────────────
  {
    key: "service-project",
    icon: "🔨",
    label: "Service Project",
    desc: "Roles and supplies — truck, tools, cleanup crew.",
    catId: "bring",
    catLabel: "Bring or Do",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    catTextColor: "text-emerald-600",
    allowGuestsDefault: false,
    defaultName: "Service Project",
    defaultDescription:
      "We need your help! Sign up for a role or claim something to bring. Every contribution — big or small — makes this project a success.",
    defaultDescriptionRsvp:
      "Join us for a ward service project! RSVP so we can plan accordingly. Wear clothes you can get dirty in and come ready to work.",
  },
  {
    key: "moving-help",
    icon: "📦",
    label: "Moving Help",
    desc: "Coordinate who brings the truck, boxes, and muscle.",
    catId: "bring",
    catLabel: "Bring or Do",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    catTextColor: "text-emerald-600",
    allowGuestsDefault: false,
    defaultName: "Moving Help",
    defaultDescription:
      "We're helping a family move! Sign up for a job or claim something to bring. Wear comfortable clothes and come ready to work.",
    defaultDescriptionRsvp:
      "We're helping a family move and need your muscle! RSVP so we know how many hands to expect. Wear comfortable clothes and come ready to lift.",
  },
  // ── Single Event ─────────────────────────────────────────────────────────
  {
    key: "fathers-sons",
    icon: "⛺",
    label: "Fathers & Sons",
    desc: "Multi-day campout — register attendees by name.",
    catId: "single",
    catLabel: "Single Event",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    catTextColor: "text-sky-600",
    allowGuestsDefault: true,
    defaultName: "Fathers & Sons Campout",
    defaultDescription:
      "Join us for our annual Fathers & Sons campout! Register yourself and the boys you're bringing — each name counts toward our headcount for food and supplies.",
  },
  {
    key: "service-day",
    icon: "🤝",
    label: "Service Day",
    desc: "Show up and help — headcount only, no time slots.",
    catId: "single",
    catLabel: "Single Event",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    catTextColor: "text-sky-600",
    allowGuestsDefault: true,
    hasCapacityDefault: true,
    defaultCapacity: 20,
    defaultName: "Ward Service Day",
    defaultDescription:
      "Come ready to serve! We'll be working together as a ward on a community project. Wear clothes you can get dirty in and bring gloves if you have them.",
  },
  {
    key: "fireside",
    icon: "🕯",
    label: "Fireside / Devotional",
    desc: "Evening gathering — people say they're coming.",
    catId: "single",
    catLabel: "Single Event",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    catTextColor: "text-sky-600",
    allowGuestsDefault: true,
    defaultName: "Ward Fireside",
    defaultDescription:
      "You're invited to an evening of uplifting messages and music. All are welcome — bring your family and friends.",
  },
  {
    key: "temple-trip",
    icon: "🏛",
    label: "Temple Trip",
    desc: "Bus seats or carpools — cap by available space.",
    catId: "single",
    catLabel: "Single Event",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    catTextColor: "text-sky-600",
    allowGuestsDefault: false,
    showCapacityDefault: true,
    hasCapacityDefault: true,
    defaultCapacity: 40,
    singleSessionForEntireEvent: true,
    defaultName: "Ward Temple Trip",
    defaultDescription:
      "Join us for a ward temple trip. Space is limited — sign up early to reserve your seat on the bus.",
  },
];

/** All templates. Built-ins default to ward-only (their copy is LDS-specific); any
 *  template that declares its own `brands` keeps that value. */
export const EVENT_TEMPLATES: EventTemplate[] = BUILTIN_TEMPLATES.map((t) => ({
  brands: ["wardsignup"] as BrandId[],
  ...t,
}));

/** Templates offered to a given brand. A template with no `brands` is available
 *  everywhere; otherwise it must list the brand. */
export function getTemplatesForBrand(brandId: BrandId): EventTemplate[] {
  return EVENT_TEMPLATES.filter((t) => !t.brands || t.brands.includes(brandId));
}

/** Grouped by category for quick access */
export const TEMPLATES_BY_CATEGORY: Record<EventCategory, EventTemplate[]> = {
  single:   EVENT_TEMPLATES.filter(t => t.catId === "single"),
  sessions: EVENT_TEMPLATES.filter(t => t.catId === "sessions"),
  bring:    EVENT_TEMPLATES.filter(t => t.catId === "bring"),
};

export function getEventTemplate(key: TemplateKey | string | undefined): EventTemplate | undefined {
  return EVENT_TEMPLATES.find(t => t.key === key);
}

/** Number of templates shown before the "+N more" button */
export const TEMPLATES_INITIAL_VISIBLE = 6;
