"use client";

import { useState } from "react";

const PMF_OPTIONS = [
  { value: "very", label: "Very disappointed" },
  { value: "somewhat", label: "Somewhat disappointed" },
  { value: "not", label: "Not disappointed" },
] as const;

const RETENTION_OPTIONS = [
  { value: "definitely", label: "Definitely" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
] as const;

export function FeedbackForm({
  token,
  productName,
}: {
  token: string;
  productName: string;
}) {
  const [pmf, setPmf] = useState("");
  const [retention, setRetention] = useState("");
  const [value, setValue] = useState("");
  const [friction, setFriction] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pmf) {
      setMessage("Please answer the first question.");
      return;
    }
    setState("sending");
    setMessage("");
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmf, retention, value, friction }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(body.error || "Something went wrong. Please try again.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  if (state === "done") {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Got it — thank you!
        </h2>
        <p className="text-gray-600">
          Your feedback goes straight to the founder. It genuinely shapes
          what gets built next.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="block text-sm font-medium text-gray-900 mb-2">
          How would you feel if you could no longer use {productName}?
        </legend>
        <div className="space-y-2">
          {PMF_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm text-gray-800"
            >
              <input
                type="radio"
                name="pmf"
                value={o.value}
                checked={pmf === o.value}
                onChange={(e) => setPmf(e.target.value)}
                className="h-4 w-4 text-cyan-700 focus:ring-cyan-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-900 mb-2">
          Will you use it for your next event?
        </legend>
        <div className="flex flex-wrap gap-4">
          {RETENTION_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm text-gray-800"
            >
              <input
                type="radio"
                name="retention"
                value={o.value}
                checked={retention === o.value}
                onChange={(e) => setRetention(e.target.value)}
                className="h-4 w-4 text-cyan-700 focus:ring-cyan-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="fb-value"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          What&apos;s the single most valuable part of {productName} for you?
        </label>
        <textarea
          id="fb-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={2000}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          placeholder="The one thing you'd miss most…"
        />
      </div>

      <div>
        <label
          htmlFor="fb-friction"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          What&apos;s the #1 thing holding it back from being perfect for you?
        </label>
        <textarea
          id="fb-friction"
          value={friction}
          onChange={(e) => setFriction(e.target.value)}
          maxLength={2000}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          placeholder="Confusing step, missing feature, almost gave up because…"
        />
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
