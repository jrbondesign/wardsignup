"use client";

import { useState } from "react";
import { createClientComponentClient } from "@/lib/auth";

export default function FixEndTimesPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const fixEndTimes = async () => {
    setLoading(true);
    setResult("");

    try {
      const supabase = createClientComponentClient();

      // Get all sessions
      const { data: sessions, error: fetchError } = await supabase
        .from("sessions")
        .select("*")
        .is("end_time", null);

      if (fetchError) {
        setResult(`Error fetching sessions: ${fetchError.message}`);
        setLoading(false);
        return;
      }

      if (!sessions || sessions.length === 0) {
        setResult("No sessions found without end_time. All sessions are already updated!");
        setLoading(false);
        return;
      }

      // Update each session with end_time = time + 1 hour
      const updates = sessions.map(async (session: any) => {
        // Parse time (e.g., "19:00") and add 1 hour
        const [hours, minutes] = session.time.split(':').map(Number);
        const endHours = (hours + 1) % 24;
        const end_time = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        return (supabase as any)
          .from("sessions")
          .update({ end_time })
          .eq("id", session.id);
      });

      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        setResult(`Updated ${sessions.length - errors.length} sessions, but ${errors.length} failed.`);
      } else {
        setResult(`✅ Successfully updated ${sessions.length} sessions with end_time values!`);
      }

    } catch (error: any) {
      setResult(`Error: ${error.message}`);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Fix End Times
          </h1>
          <p className="text-gray-600 mb-6">
            This utility will add end_time values to all sessions that don't have them.
            It will set end_time to 1 hour after the start time.
          </p>

          <button
            onClick={fixEndTimes}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors mb-4"
          >
            {loading ? "Updating..." : "Fix All Sessions"}
          </button>

          {result && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap">{result}</pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
