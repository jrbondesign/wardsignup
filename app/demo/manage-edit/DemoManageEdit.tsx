"use client";

import { useState } from "react";

type Slot = { id: string; date: string; time: string; capacity: number; location: string; signups: { name: string; guests: string[] }[] };

const INITIAL_SLOTS: Slot[] = [
  { id: "s1", date: "Thu, Oct 29", time: "6:00 PM to 6:30 PM", capacity: 4, location: "Relief Society room", signups: [{ name: "Liz Carter", guests: ["Sam Carter"] }, { name: "Mark Allen", guests: [] }] },
  { id: "s2", date: "Thu, Oct 29", time: "6:30 PM to 7:00 PM", capacity: 4, location: "Relief Society room", signups: [{ name: "Ana Ruiz", guests: [] }] },
  { id: "s3", date: "Thu, Oct 29", time: "7:00 PM to 7:30 PM", capacity: 4, location: "Relief Society room", signups: [] },
];

const card = "bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)]";
const ghostBtn = "flex-1 text-sm font-semibold text-center px-3 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all no-underline";
const primaryBtn = "flex-1 text-sm font-semibold text-center px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.30)] no-underline";

function Section({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-4">
      <h2 className="font-serif text-[22px] text-[#0D2B35] mb-1">{title}</h2>
      <p className="text-xs text-[#5A8399] mb-4">{note}</p>
      {children}
    </section>
  );
}

export default function DemoManageEdit() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(INITIAL_SLOTS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showPublic, setShowPublic] = useState(true);
  const [manageSignups, setManageSignups] = useState(INITIAL_SLOTS[0].signups);

  const totalCapacity = INITIAL_SLOTS.reduce((s, x) => s + x.capacity, 0);
  const totalSignups = INITIAL_SLOTS.reduce((s, x) => s + x.signups.length, 0);
  const totalGuests = INITIAL_SLOTS.reduce((s, x) => s + x.signups.reduce((g, su) => g + su.guests.length, 0), 0);
  const remaining = totalCapacity - totalSignups;
  const fillPct = Math.round((totalSignups / totalCapacity) * 100);

  const removeSlot = (i: number) => {
    const n = slots[i].signups.length;
    if (n > 0 && !confirm(`${n} ${n === 1 ? "person is" : "people are"} signed up for this slot. Removing it deletes ${n === 1 ? "that signup" : "those signups"} when you save. Remove it?`)) return;
    setSlots(slots.filter((_, j) => j !== i));
    setDirty(true);
  };
  const save = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setDirty(false); setLastSavedAt(new Date()); }, 900);
  };
  const toggleSetting = () => {
    setShowPublic((v) => !v);
    setSettingsStatus("saving");
    setTimeout(() => setSettingsStatus("saved"), 700);
  };

  return (
    <main className="min-h-screen bg-[#F2FAFC] px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Review demo for PR #68. Sample data only. Nothing here is saved or sent, and this page does not exist on the live site.
      </div>

      <Section id="dashboard" title="1. Dashboard event card" note="Visible Edit button, labeled three dot menu, Edit details in the menu.">
        <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(8,100,126,0.08)] relative flex flex-col">
          <div className="p-6 pb-4 flex-1">
            <div className="absolute top-4 right-4">
              <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="More actions for Halloween Party Volunteers" aria-haspopup="menu" aria-expanded={menuOpen} className="p-2 hover:bg-[#0E96B0]/8 rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]">
                <svg className="w-4 h-4 text-[#5A8399]" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-[#0E96B0]/10 py-1 z-10">
                  <a href="#edit" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] no-underline">Edit details</a>
                  <span className="block px-4 py-2.5 text-sm text-[#2E5566]">Download QR code</span>
                  <span className="block px-4 py-2.5 text-sm text-[#2E5566]">Copy link</span>
                  <span className="block px-4 py-2.5 text-sm text-red-500">Delete</span>
                </div>
              )}
            </div>
            <h3 className="font-serif text-[18px] text-[#0D2B35] mb-1 pr-8 leading-snug">Halloween Party Volunteers</h3>
            <p className="text-xs text-[#5A8399] mb-4">Created Oct 12, 2026</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-[#E6F7FB] rounded-xl p-2.5 text-center"><div className="text-[10px] font-semibold tracking-[0.5px] uppercase text-[#0E96B0] mb-0.5">Total spots</div><div className="text-xl font-semibold text-[#054F64]">{totalCapacity}</div></div>
              <div className="bg-[#edfaf4] rounded-xl p-2.5 text-center"><div className="text-[10px] font-semibold tracking-[0.5px] uppercase text-[#1D9E75] mb-0.5">Signed up</div><div className="text-xl font-semibold text-[#0F6E56]">{totalSignups}</div></div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: "#fdf6ec" }}><div className="text-[10px] font-semibold tracking-[0.5px] uppercase mb-0.5" style={{ color: "#d97706" }}>Remaining</div><div className="text-xl font-semibold" style={{ color: "#b45309" }}>{remaining}</div></div>
            </div>
            <div className="h-1.5 bg-[#0E96B0]/10 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#22C8D8] to-[#08647E]" style={{ width: `${fillPct}%` }} /></div>
            <div className="text-[11px] text-[#5A8399] mt-1.5 text-right">{fillPct}% filled</div>
          </div>
          <div className="px-6 pb-6 flex gap-2">
            <a href="#manage" className={primaryBtn}>Manage</a>
            <a href="#edit" aria-label="Edit details for Halloween Party Volunteers" className={ghostBtn}>Edit</a>
            <a href="#public" className={ghostBtn}>Preview</a>
          </div>
        </div>
      </Section>

      <Section id="manage" title="2. Manage page" note="Signed up count with guests shown separately. Settings moved to Edit; Manage links there. Bigger Remove signup target.">
        <div className={`${card} p-5 mb-4`}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center"><div className="h-8 flex items-center text-[10px] font-semibold uppercase text-[#0E96B0]">Total spots</div><div className="text-3xl font-semibold text-[#054F64]">{totalCapacity}</div></div>
            <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center"><div className="h-8 flex items-center text-[10px] font-semibold uppercase text-[#1D9E75]">Signed up</div><div className="text-3xl font-semibold text-[#0F6E56]">{totalSignups}</div>
              {totalGuests > 0 && <div className="text-[10px] text-[#5A8399] mt-0.5 text-center">plus {totalGuests} {totalGuests === 1 ? "guest" : "guests"} ({totalSignups + totalGuests} people)</div>}</div>
            <div className="rounded-xl p-4 flex flex-col items-center" style={{ background: "#fdf6ec" }}><div className="h-8 flex items-center text-[10px] font-semibold uppercase" style={{ color: "#d97706" }}>Remaining</div><div className="text-3xl font-semibold" style={{ color: "#b45309" }}>{remaining}</div></div>
          </div>
          <div className="rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#0D2B35] mb-0.5">Event settings</div>
              <div className="text-[11px] text-[#5A8399] leading-snug">Visibility, notifications, Google Calendar, leader, time zone and guests are in Edit details.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex items-center text-xs font-semibold px-3 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/35 text-[#08647E] bg-white/60">Send organizer report now</button>
              <a href="#event-settings" className="inline-flex items-center text-xs font-semibold px-3 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white no-underline">Edit settings</a>
            </div>
          </div>
        </div>
        <div className={`${card} p-5`}>
          <div className="text-sm font-semibold text-[#0D2B35] mb-1">{INITIAL_SLOTS[0].date} · {INITIAL_SLOTS[0].time}</div>
          <div className="text-[11px] font-semibold uppercase text-[#0E96B0] mb-2">Signed up</div>
          {manageSignups.length === 0 && <p className="text-sm text-[#5A8399]">No one yet.</p>}
          {manageSignups.map((su) => (
            <div key={su.name} className="border-t border-[#0E96B0]/10 py-2">
              <div className="text-sm text-[#0D2B35]">{su.name}{su.guests.length > 0 && <span className="text-xs text-[#5A8399]"> + {su.guests.join(", ")}</span>}</div>
              <button type="button" aria-label={`Remove ${su.name} from this slot`} onClick={() => { if (confirm(`Remove ${su.name}? (demo only)`)) setManageSignups(manageSignups.filter((x) => x.name !== su.name)); }} className="mt-1 -ml-2 px-2 py-2 min-h-[36px] rounded-lg text-[12px] font-medium text-red-500 hover:text-red-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400">Remove signup</button>
            </div>
          ))}
        </div>
      </Section>

      <Section id="edit" title="3. Edit details" note="Save status in the header, settings save indicator, signup count per slot, warning before removing a slot with signups. No OPTIONAL badges.">
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-3 mb-4">
            <h1 className="font-serif text-[28px] text-[#0D2B35]">Edit details</h1>
            <span role="status" aria-live="polite" className="ml-auto text-[11px] font-semibold rounded-full px-2.5 py-1 border border-[rgba(14,150,176,0.25)] text-[#08647E] bg-[#F8FCFD] whitespace-nowrap">
              {saving ? "Saving…" : dirty ? "Unsaved changes" : lastSavedAt ? "All changes saved" : "No changes yet"}
            </span>
          </div>
          <div id="event-settings" className="mb-6 scroll-mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-semibold text-[#2E5566]">Settings</div>
              <span role="status" aria-live="polite" className="text-[11px] text-[#5A8399]">{settingsStatus === "saving" ? "Saving…" : settingsStatus === "saved" ? "Saved" : "Settings save as you change them"}</span>
            </div>
            <div className="rounded-xl border border-[#0E96B0]/18 px-4 py-3 flex items-center justify-between">
              <div><div className="text-sm font-semibold text-[#0D2B35]">Visibility</div><div className="text-[11px] text-[#5A8399]">Show who signed up on the public page</div></div>
              <button type="button" role="switch" aria-checked={showPublic} onClick={toggleSetting} className={`w-11 h-6 rounded-full relative transition-colors ${showPublic ? "bg-[#0E96B0]" : "bg-gray-300"}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${showPublic ? "left-[22px]" : "left-0.5"}`} /></button>
            </div>
          </div>
          <div className="border-t border-[rgba(14,150,176,0.12)] pt-6">
            <div className="text-sm font-semibold text-[#0D2B35]">Slots</div>
            <div className="text-xs text-[#5A8399] mb-3">Add, edit, or replace slots for this event</div>
            {slots.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between gap-2 border border-[#0E96B0]/12 rounded-xl px-3 py-3 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#0D2B35]">{s.date} · {s.time}</div>
                  <div className="text-[11px] text-[#5A8399] mt-1">
                    <span className="font-semibold text-[#2E5566]">Spots:</span> {s.capacity}
                    <span className="mx-2 text-[#A0B7C2]">·</span>
                    <span className={s.signups.length > 0 ? "font-semibold text-[#0F6E56]" : ""}>{s.signups.length} signed up</span>
                    <span className="mx-2 text-[#A0B7C2]">·</span>{s.location}
                  </div>
                </div>
                <button type="button" onClick={() => removeSlot(i)} aria-label="Remove this slot" className="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-2">Remove</button>
              </div>
            ))}
            <button type="button" onClick={save} disabled={saving} className="mt-4 w-full text-sm font-semibold px-4 py-3 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" onClick={() => { setSlots(INITIAL_SLOTS); setDirty(false); }} className="mt-2 w-full text-xs text-[#5A8399] underline">Reset demo slots</button>
          </div>
        </div>
      </Section>

      <Section id="public" title="4. Public page, event has ended" note="Replaces the old 'No sessions available yet' message when every slot is in the past.">
        <div className={`${card} p-10 text-center`}>
          <p className="text-sm text-[#5A8399]">This event has ended. All slots have passed.</p>
        </div>
      </Section>
    </main>
  );
}
