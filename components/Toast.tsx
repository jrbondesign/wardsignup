"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string;
  show: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, show, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 right-4 z-[200] animate-slide-in">
      <div className="bg-white border border-[rgba(14,150,176,0.20)] text-[#0D2B35] px-5 py-3 rounded-xl shadow-[0_8px_28px_rgba(8,100,126,0.18)] flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span className="text-sm font-semibold">{message}</span>
      </div>
    </div>
  );
}
