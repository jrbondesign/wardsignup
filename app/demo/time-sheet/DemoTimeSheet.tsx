"use client";

import { useState, type ReactNode } from "react";
import TimeInput, { TimeRangeRow } from "@/components/TimeInput";
import { endTimeNote, formatTime12h, formatTimeRange, isEndSameAsStart, startTimePanelError } from "@/lib/utils";

/*
 * Preview only. Every name, ward and time here is made up, and nothing is
 * saved or sent: all state lives in this page. Uses the real TimeInput.
 */

const card = "bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-4 sm:p-5";
const primaryBtn =
  "w-full text-base font-semibold px-4 py-[13px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] touch-manipulation";
const ghostBtn =
  "flex-1 min-h-11 text-sm font-semibold px-4 rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] bg-white touch-manipulation";
const ORDER_ERROR = "End time can't be the same as start time.";

function Stored({ values }: { values: Record<string, string> }) {
  return (
    <p className="mt-3 text-[12px] font-mono text-[#2E5566] bg-[#F2FAFC] border border-[rgba(14,150,176,0.18)] rounded-lg px-2.5 py-1.5" aria-live="polite">
      Stored value:{" "}
      {Object.entries(values).map(([k, v], i) => (
        <span key={k}>
          {i > 0 ? ", " : ""}
          {k} <strong className="text-[#0D2B35]">{v ? `"${v}"` : '""'}</strong>
        </span>
      ))}
    </p>
  );
}

function Section({ id, title, where, children }: { id: string; title: string; where: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-4">
      <h2 className="font-serif text-[22px] leading-7 text-[#0D2B35]">{title}</h2>
      <p className="text-xs text-[#5A8399] mt-0.5 mb-3">{where}</p>
      {children}
    </section>
  );
}

/** Count of fixed-length appointments in a same-day window. */
function appointmentCount(start: string, end: string, minutes: number): number {
  if (!start || !end) return 0;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const span = toMin(end) - toMin(start);
  return span > 0 ? Math.floor(span / minutes) : 0;
}

function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  return (
    <div role="status" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#E6F7FB] border border-[rgba(14,150,176,0.25)] px-3 py-2 text-sm text-[#08647E]">
      <span>{text}</span>
      <button type="button" onClick={onDone} className="min-h-11 px-2 text-[13px] font-semibold">
        OK
      </button>
    </div>
  );
}

function CreateWindow() {
  const [start, setStart] = useState("15:00");
  const [end, setEnd] = useState("17:00");
  const n = appointmentCount(start, end, 15);
  return (
    <Section id="create-window" title="Create: appointment window" where="Create event, Tithing Declaration template (TimeSection)">
      <div className={card}>
        <p className="text-sm font-semibold text-[#0D2B35] mb-3">Appointment window</p>
        <TimeRangeRow
          start={<TimeInput value={start} onChange={setStart} label="Start time" labelNote="(required)" required />}
          end={<TimeInput value={end} onChange={setEnd} label="End time" labelNote="(required)" required error={isEndSameAsStart(start, end) ? ORDER_ERROR : undefined} />}
        />
        <p className="mt-3 text-sm text-[#2E5566]">
          {n > 0 ? `${n} appointments, 15 min each, ${formatTimeRange(start, end, { clock: "12h" })}` : "Pick an end time after the start time."}
        </p>
        <Stored values={{ start, end }} />
      </div>
    </Section>
  );
}

function CreateSingle() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [extra, setExtra] = useState("18:30");
  return (
    <Section id="create-single" title="Create: event time" where="Create event, single event (TimeSection), plus one extra labeled time">
      <div className={card}>
        <TimeRangeRow
          start={<TimeInput value={start} onChange={setStart} label="Start time" labelNote="(required)" required />}
          end={
            <TimeInput
              value={end}
              onChange={setEnd}
              label="End time"
              labelNote={endTimeNote(start, end)}
              error={isEndSameAsStart(start, end) ? ORDER_ERROR : undefined}
            />
          }
        />
        {start ? (
          <p className="mt-3 text-sm text-[#2E5566]">{formatTimeRange(start, end, { clock: "12h" })}</p>
        ) : (
          <p className="mt-3 text-sm text-[#5A8399]">Try 7:00 PM. Then set End to 1:00 AM to see an overnight event.</p>
        )}
        <div className="mt-4 pt-4 border-t border-[rgba(14,150,176,0.12)]">
          <p className="text-[13px] font-semibold text-[#2E5566] mb-1">Meet at the church</p>
          <TimeInput value={extra} onChange={setExtra} ariaLabel="Meet at the church time" />
        </div>
        <Stored values={{ start, end, meet: extra }} />
      </div>
    </Section>
  );
}

function EditItems() {
  const [start, setStart] = useState("18:30");
  const [end, setEnd] = useState("20:00");
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Section id="edit-items" title="Edit: items event" where="Edit event, bring a dish event (EditItemsEvent)">
      <div className={card}>
        <p className="text-sm font-semibold text-[#0D2B35]">Sample Ward Potluck</p>
        <p className="text-xs text-[#5A8399] mb-3">Sat, Nov 21 · Cultural hall</p>
        <TimeRangeRow
          start={<TimeInput value={start} onChange={setStart} label="Start time" labelNote="(optional)" />}
          end={<TimeInput value={end} onChange={setEnd} label="End time" labelNote={endTimeNote(start, end)} error={isEndSameAsStart(start, end) ? ORDER_ERROR : undefined} />}
        />
        <Stored values={{ start, end }} />
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setSaved(`Saved (demo only): ${formatTimeRange(start, end, { clock: "12h" }) || "no time"}`)}>
          Save changes
        </button>
        {saved && <Toast text={saved} onDone={() => setSaved(null)} />}
      </div>
    </Section>
  );
}

function AddOne() {
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("20:00");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const panel = document.getElementById("demo-add-one");
    const partial = !!panel?.querySelector('[data-time-partial="true"]');
    const problem = startTimePanelError(start, partial, "session");
    if (problem) return setError(problem);
    setError(null);
    setMsg(`Added 1 session (demo only): ${formatTimeRange(start, end, { clock: "12h" })}`);
  };
  return (
    <Section id="edit-add" title="Edit: add one session" where="Edit event, Add one (AddSessionForm). Defaults to 7:00 PM">
      <div className={card} id="demo-add-one">
        <p className="text-sm font-semibold text-[#0D2B35] mb-3">Add one session</p>
        <TimeRangeRow
          start={<TimeInput value={start} onChange={setStart} label="Start time" labelNote="(required)" required nativeValidity={false} />}
          end={<TimeInput value={end} onChange={setEnd} label="End time" labelNote={endTimeNote(start, end)} nativeValidity={false} error={isEndSameAsStart(start, end) ? ORDER_ERROR : undefined} />}
        />
        <Stored values={{ start, end }} />
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button type="button" className={ghostBtn} onClick={() => { setStart(""); setEnd(""); setMsg(null); }}>
            Clear both
          </button>
          <button type="button" className={`${ghostBtn} !bg-[#E6F7FB]`} onClick={add}>
            Add
          </button>
        </div>
        {msg && <Toast text={msg} onDone={() => setMsg(null)} />}
      </div>
    </Section>
  );
}

function BulkAdd() {
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("20:00");
  return (
    <Section id="edit-bulk" title="Edit: add multiple" where="Edit event, Bulk add (BulkAddSessionsForm). Defaults to 7:00 PM">
      <div className={card}>
        <p className="text-sm font-semibold text-[#0D2B35] mb-1">Every Tue and Thu, Nov 17 to Dec 3</p>
        <p className="text-xs text-[#5A8399] mb-3">Sample Youth Class</p>
        <TimeRangeRow
          start={<TimeInput value={start} onChange={setStart} label="Start time" labelNote="(required)" required nativeValidity={false} />}
          end={<TimeInput value={end} onChange={setEnd} label="End time" labelNote={endTimeNote(start, end)} nativeValidity={false} />}
        />
        <p className="mt-3 text-sm text-[#2E5566]">6 sessions will be created: {formatTimeRange(start, end, { clock: "12h" }) || "pick a start time"}.</p>
        <Stored values={{ start, end }} />
      </div>
    </Section>
  );
}

function Reschedule() {
  const [start, setStart] = useState("15:00");
  const [end, setEnd] = useState("17:00");
  const n = appointmentCount(start, end, 15) * 2;
  return (
    <Section id="edit-reschedule" title="Edit: reschedule" where="Edit event, Reschedule (RescheduleForm), tithing style window">
      <div className={card}>
        <p className="text-sm font-semibold text-[#0D2B35] mb-3">Appointment hours, Sundays Dec 6 and Dec 13</p>
        <TimeRangeRow
          start={<TimeInput value={start} onChange={setStart} label="Start time" labelNote="(required)" required nativeValidity={false} />}
          end={<TimeInput value={end} onChange={setEnd} label="End time" labelNote="(required)" required nativeValidity={false} error={isEndSameAsStart(start, end) ? ORDER_ERROR : undefined} />}
        />
        <div className="mt-3 bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-4 py-3 text-sm text-[#2E5566]">
          <strong className="text-[#0D2B35]">Ready to go:</strong>{" "}
          {n > 0 ? `${n} appointments will be created: 15 min each, ${formatTimeRange(start, end, { clock: "12h" })}.` : "Fix the end time above to generate appointments."}
        </div>
        <Stored values={{ start, end }} />
      </div>
    </Section>
  );
}

type Row = { id: string; title: string; time: string; end: string; spots: string };
const ROWS: Row[] = [
  { id: "r1", title: "Sample Family A", time: "17:30", end: "18:30", spots: "1 of 1 spot filled" },
  { id: "r2", title: "Sample Family B", time: "19:10", end: "20:10", spots: "0 of 1 spot filled" },
  { id: "r3", title: "Night shift (sample)", time: "23:00", end: "01:00", spots: "2 of 4 spots filled" },
];

function SessionsList() {
  const [rows, setRows] = useState(ROWS);
  const [editing, setEditing] = useState<string | null>("r2");
  const update = (id: string, key: "time" | "end", v: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: v } : r)));
  return (
    <Section id="edit-list" title="Edit: sessions list" where="Edit event, each row in the list (SessionsList). Row 2 is 7:10 PM, off the 15 minute grid">
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[#0D2B35] leading-tight">{r.title}</div>
                <div className="text-xs text-[#5A8399] mt-1">{formatTimeRange(r.time, r.end, { clock: "12h" })}</div>
                <div className="text-[11px] text-[#5A8399] mt-1">{r.spots}</div>
              </div>
              <button
                type="button"
                aria-expanded={editing === r.id}
                onClick={() => setEditing(editing === r.id ? null : r.id)}
                className="shrink-0 min-h-11 px-3 text-[13px] font-semibold text-[#0E96B0]"
              >
                {editing === r.id ? "Done" : "Edit"}
              </button>
            </div>
            {editing === r.id && (
              <div className="mt-3">
                <TimeRangeRow
                  labelVariant="micro"
                  start={<TimeInput value={r.time} onChange={(v) => update(r.id, "time", v)} label="Start time" labelNote="(required)" labelVariant="micro" required />}
                  end={<TimeInput value={r.end} onChange={(v) => update(r.id, "end", v)} label="End time" labelNote={endTimeNote(r.time, r.end)} labelVariant="micro" />}
                />
                <Stored values={{ start: r.time, end: r.end }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function DemoTimeSheet() {
  return (
    <main className="min-h-screen bg-[#F2FAFC] pb-16">
      <div role="note" className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm font-semibold text-center px-4 py-2.5">
        Preview only, fake data. Nothing here is saved or sent.
      </div>
      <div className="px-4 py-5 max-w-2xl mx-auto">
        <h1 className="font-serif text-[28px] leading-8 text-[#0D2B35]">Time sheet picker (Option A)</h1>
        <p className="mt-2 text-sm text-[#2E5566]">
          Tap any time to open the sheet. Pick an hour, AM or PM, and a minute, then Set. Cancel, Escape or a tap
          outside closes it without changing anything. The gray line under each card shows the exact value the app would store.
        </p>
        <nav aria-label="Demo sections" className="mt-3 mb-6 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          {[
            ["#create-window", "Create window"],
            ["#create-single", "Create time"],
            ["#edit-items", "Edit items"],
            ["#edit-add", "Add one"],
            ["#edit-bulk", "Add multiple"],
            ["#edit-reschedule", "Reschedule"],
            ["#edit-list", "Sessions list"],
          ].map(([href, text]) => (
            <a key={href} href={href} className="min-h-11 inline-flex items-center text-[#0E96B0] font-semibold">
              {text}
            </a>
          ))}
        </nav>
        <CreateWindow />
        <CreateSingle />
        <EditItems />
        <AddOne />
        <BulkAdd />
        <Reschedule />
        <SessionsList />
        <p className="text-xs text-[#5A8399]">
          All times show in 12 hour form (for example {formatTime12h("19:00")}) even on a phone set to 24 hour. Stored values stay 24 hour.
        </p>
      </div>
    </main>
  );
}
