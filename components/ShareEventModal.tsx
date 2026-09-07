"use client";

import { useState } from "react";
import { useBrand } from "@/components/BrandProvider";
import { usePostHog } from "posthog-js/react";
import Toast from "./Toast";

interface ShareEventModalProps {
  eventId: string;
  eventName: string;
  shareableLink: string;
  onClose: () => void;
}

export default function ShareEventModal({
  eventId,
  eventName,
  shareableLink,
  onClose,
}: ShareEventModalProps) {
  const brand = useBrand();
  const posthog = usePostHog();
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareableLink);
    posthog?.capture("event_shared", { event_id: eventId, method: "copy_link" });
    setCopied(true);
    setShowToast(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaEmail = () => {
    posthog?.capture("event_shared", { event_id: eventId, method: "email" });
    const subject = encodeURIComponent(`Sign up for ${eventName}`);
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to invite you to sign up as a teacher for ${eventName}.\n\nClick here to view available sessions and sign up:\n${shareableLink}\n\nThank you!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const shareViaWhatsApp = () => {
    posthog?.capture("event_shared", { event_id: eventId, method: "whatsapp" });
    const text = encodeURIComponent(
      `Sign up for ${eventName}: ${shareableLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareViaSMS = () => {
    posthog?.capture("event_shared", { event_id: eventId, method: "sms" });
    const text = encodeURIComponent(
      `Sign up for ${eventName}: ${shareableLink}`
    );
    window.open(`sms:?&body=${text}`, "_blank");
  };

  return (
    <>
      <Toast
        message="Link copied to clipboard!"
        show={showToast}
        onClose={() => setShowToast(false)}
      />
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              Share Event
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
          <p className="text-gray-600 mt-1">
            Share the link to {eventName} — people can sign up without creating an account.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Shareable Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareableLink}
                readOnly
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
              <button
                onClick={copyToClipboard}
                className={`px-6 py-2 rounded-lg transition-colors font-semibold ${
                  copied
                    ? "bg-green-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Share via
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={shareViaEmail}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-xl">📧</span>
                <span className="font-medium">Email</span>
              </button>
              <button
                type="button"
                onClick={shareViaWhatsApp}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-xl">💬</span>
                <span className="font-medium">WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={shareViaSMS}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-xl">📱</span>
                <span className="font-medium">SMS</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 border-t border-gray-200 pt-4">
            Sending email from {brand.name} is paused during beta. Use your own email or messaging apps above.
          </p>
        </div>
      </div>
      </div>
    </>
  );
}
