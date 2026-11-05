"use client";

import { useState } from "react";
import TimeInput from "@/components/TimeInput";

const inputCls =
  "w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]";

function Row({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="mb-5">
      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
        {label}
      </label>
      <TimeInput
        value={value}
        onChange={onChange}
        className={inputCls}
        required={required}
        ariaLabel={label}
      />
      <p className="mt-1.5 text-xs text-[#5A8399]">
        Stored value: <code className="text-[#0D2B35]">{value || "(empty)"}</code>
      </p>
    </div>
  );
}

export default function DemoTimeInput() {
  const [start, setStart] = useState("16:30");
  const [end, setEnd] = useState("18:00");
  const [midnight, setMidnight] = useState("00:00");
  const [noon, setNoon] = useState("12:00");
  const [empty, setEmpty] = useState("");

  return (
    <main className="min-h-screen bg-[#F2FAFC] px-4 py-6 max-w-lg mx-auto">
      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Preview only: hour, minute, and AM/PM dropdown for time inputs. Sample state only.
      </div>
      <h1 className="font-serif text-[22px] text-[#0D2B35] mb-4">Time input with AM/PM</h1>
      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-5">
        <Row label="Start time" value={start} onChange={setStart} required />
        <Row label="End time (optional)" value={end} onChange={setEnd} />
        <Row label="Midnight edge (12 AM)" value={midnight} onChange={setMidnight} />
        <Row label="Noon edge (12 PM)" value={noon} onChange={setNoon} />
        <Row label="Empty optional" value={empty} onChange={setEmpty} />
      </div>
    </main>
  );
}
