"use client";

import UnifiedCreateForm from "@/components/create/UnifiedCreateForm";

/** Same shell as app/create/page.tsx (main, max-w-2xl column, white card). */
export default function CreateLayoutFixture() {
  return (
    <main className="min-h-screen bg-[#F4FAFB] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
          <h1 className="font-serif text-[26px] text-[#0D2B35] mb-1">Create a new event</h1>
          <p className="text-[13px] text-[#5A8399] mb-3">Layout check only. Nothing here is saved.</p>
          {/* Capture-phase stop so the form's own submit handler never runs here. */}
          <div
            onSubmitCapture={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <UnifiedCreateForm initialTemplateKey={null} />
          </div>
        </div>
      </div>
    </main>
  );
}
