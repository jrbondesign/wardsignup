export type SessionLike = {
  day_of_week: number;
  time: string;
  end_time?: string;
  capacity: number;
  session_date?: string;
};

export type InferredTithingConfig = {
  isTithingDeclaration: boolean;
  days: number[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  capacity: number;
};

function parseTimeToMinutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mode(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best: { n: number; c: number } | null = null;
  for (const [n, c] of counts) {
    if (!best || c > best.c || (c === best.c && n < best.n)) best = { n, c };
  }
  return best?.n ?? null;
}

export function inferTithingDeclarationConfig(
  sessions: SessionLike[],
): InferredTithingConfig {
  const withDate = sessions.filter((s) => Boolean(s.session_date));
  const dateCoverage = sessions.length > 0 ? withDate.length / sessions.length : 0;

  const byDate = new Map<string, SessionLike[]>();
  for (const s of withDate) {
    const d = s.session_date!;
    const arr = byDate.get(d) ?? [];
    arr.push(s);
    byDate.set(d, arr);
  }

  const multiSlotDays = [...byDate.values()].filter((arr) => arr.length >= 2).length;
  const multiSlotRatio = byDate.size > 0 ? multiSlotDays / byDate.size : 0;

  const durations: number[] = [];
  for (const s of sessions) {
    const start = parseTimeToMinutes(s.time);
    const end = parseTimeToMinutes(s.end_time);
    if (start === null || end === null) continue;
    const d = end - start;
    if (d > 0 && d <= 180) durations.push(d);
  }

  const inferredDuration = mode(durations) ?? 15;

  // Heuristic (no schema field): Tithing Declaration tends to have many slots per date
  // with consistent small durations and session_date populated.
  const hasAnyMultiSlotDay = multiSlotDays >= 1;
  const smallDuration = inferredDuration > 0 && inferredDuration <= 60;
  const enoughDurationSamples = durations.length >= Math.max(3, Math.floor(sessions.length * 0.2));
  const looksLikeTithing =
    sessions.length >= 6 &&
    dateCoverage >= 0.7 &&
    smallDuration &&
    enoughDurationSamples &&
    (multiSlotRatio >= 0.25 || hasAnyMultiSlotDay);

  const days = Array.from(
    new Set(sessions.map((s) => s.day_of_week).filter((d) => d >= 0 && d <= 6)),
  ).sort((a, b) => a - b);

  const startTimes = sessions
    .map((s) => parseTimeToMinutes(s.time))
    .filter((m): m is number => m !== null);
  const endTimes = sessions
    .map((s) => parseTimeToMinutes(s.end_time))
    .filter((m): m is number => m !== null);

  const startTime = startTimes.length ? minutesToTime(Math.min(...startTimes)) : "15:00";
  const endTime = endTimes.length ? minutesToTime(Math.max(...endTimes)) : "17:00";

  const capacities = sessions
    .map((s) => Number(s.capacity))
    .filter((c) => Number.isFinite(c) && c > 0 && c <= 50);
  const capacity = mode(capacities) ?? 1;

  return {
    isTithingDeclaration: looksLikeTithing,
    days: days.length ? days : [0],
    startTime,
    endTime,
    durationMinutes: inferredDuration,
    capacity,
  };
}

export function generateTithingDeclarationSessions(args: {
  rangeStart: Date;
  rangeEnd: Date;
  days: number[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  capacity: number;
  location: string;
  notes: string;
}): Array<{
  day_of_week: number;
  time: string;
  end_time: string;
  capacity: number;
  location: string;
  notes: string;
  session_date: string;
}> {
  const startMin = parseTimeToMinutes(args.startTime);
  const endMin = parseTimeToMinutes(args.endTime);
  if (startMin === null || endMin === null) return [];
  if (args.durationMinutes <= 0) return [];
  if (endMin <= startMin) return [];

  const sessions: Array<{
    day_of_week: number;
    time: string;
    end_time: string;
    capacity: number;
    location: string;
    notes: string;
    session_date: string;
  }> = [];

  const current = new Date(args.rangeStart);
  current.setHours(0, 0, 0, 0);
  const end = new Date(args.rangeEnd);
  end.setHours(0, 0, 0, 0);

  const daySet = new Set(args.days.filter((d) => d >= 0 && d <= 6));

  while (current <= end) {
    const dow = current.getDay();
    if (daySet.has(dow)) {
      for (let slot = startMin; slot + args.durationMinutes <= endMin; slot += args.durationMinutes) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, "0");
        const d = String(current.getDate()).padStart(2, "0");
        sessions.push({
          day_of_week: dow,
          time: minutesToTime(slot),
          end_time: minutesToTime(slot + args.durationMinutes),
          capacity: args.capacity,
          location: args.location,
          notes: args.notes,
          session_date: `${y}-${m}-${d}`,
        });
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return sessions;
}

