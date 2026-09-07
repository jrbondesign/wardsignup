export type TemplateKey = "missionary-dinners" | "tithing-declaration";

export interface TemplateSessionInput {
  day_of_week: number;
  time: string;
  end_time?: string;
  capacity: number;
  location: string;
  notes: string;
  session_date?: string;
}

function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${padTwo(h)}:${padTwo(m)}`;
}

/** Returns the upcoming Sunday (today if already Sunday). */
function upcomingSunday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  if (dow === 0) return today;
  const d = new Date(today);
  d.setDate(today.getDate() + (7 - dow));
  return d;
}

/**
 * Missionary Dinners:
 * Two full weeks, Sunday → Saturday × 2.
 * One slot per day at 17:00–18:00, capacity 1.
 */
export function getMissionaryDinnerSessions(): TemplateSessionInput[] {
  const start = upcomingSunday();
  const sessions: TemplateSessionInput[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    sessions.push({
      day_of_week: d.getDay(),
      time: "17:00",
      end_time: "18:00",
      capacity: 1,
      location: "",
      notes: "",
      session_date: formatDate(d),
    });
  }
  return sessions;
}

/**
 * Tithing Declaration:
 * All Sundays in the current calendar month.
 * 15-minute slots from 15:00–17:00, capacity 1 per slot.
 */
export function getTithingDeclarationSessions(): TemplateSessionInput[] {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const sessions: TemplateSessionInput[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (d.getDay() !== 0) continue; // Sundays only

    // 15-min slots: 15:00 → 17:00 (8 slots)
    const startMin = 15 * 60; // 900
    const endMin = 17 * 60;   // 1020
    for (let slot = startMin; slot + 15 <= endMin; slot += 15) {
      sessions.push({
        day_of_week: 0,
        time: minutesToHHMM(slot),
        end_time: minutesToHHMM(slot + 15),
        capacity: 1,
        location: "",
        notes: "",
        session_date: formatDate(d),
      });
    }
  }
  return sessions;
}

export function getTemplateSessions(key: TemplateKey): TemplateSessionInput[] {
  if (key === "missionary-dinners") return getMissionaryDinnerSessions();
  if (key === "tithing-declaration") return getTithingDeclarationSessions();
  return [];
}

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  "missionary-dinners": "Missionary Dinners",
  "tithing-declaration": "Tithing Declaration",
};

export const TEMPLATE_DESCRIPTIONS: Record<TemplateKey, string> = {
  "missionary-dinners":
    "2 weeks of daily dinner slots (Sun–Sat), 5–6 PM, 1 family per day. Edit any slot below.",
  "tithing-declaration":
    "15-min appointment slots every Sunday this month, 3–5 PM, 1 family per slot. Edit any slot below.",
};
