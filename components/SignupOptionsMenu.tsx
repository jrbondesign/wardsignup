"use client";

import { useEffect, useRef, useState } from "react";

interface SignupOptionsMenuProps {
  memberName: string;
  contextLabel: string; // "Session Name" or "Item Name"
  onRemove: () => void;
  onClose: () => void;
}

export default function SignupOptionsMenu({
  memberName,
  contextLabel,
  onRemove,
  onClose,
}: SignupOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [shouldFlipUp, setShouldFlipUp] = useState(false);

  useEffect(() => {
    // Detect mobile on mount
    setIsMobile(window.innerWidth < 768);

    // On desktop, check if we should flip the popover upward
    if (window.innerWidth >= 768 && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      
      // If there's less than 100px space below or the menu is cut off, flip upward
      if (spaceBelow < 100 || rect.bottom > viewportHeight) {
        setShouldFlipUp(true);
      }
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    // Focus the Remove button when menu opens
    setTimeout(() => removeButtonRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  if (isMobile) {
    // Bottom sheet on mobile
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-[100] animate-fade-in" onClick={onClose} />
        <div
          ref={menuRef}
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-8px_28px_rgba(8,100,126,0.18)] z-[101] animate-slide-up pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="menu"
          aria-label={`Options for ${memberName}`}
        >
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-base font-semibold text-[#0D2B35]">Options for {memberName}</h3>
          </div>
          <div className="p-2">
            <button
              ref={removeButtonRef}
              type="button"
              onClick={() => {
                onClose();
                onRemove();
              }}
              className="w-full min-h-[44px] px-4 py-3 text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
              role="menuitem"
            >
              Remove from {contextLabel}
            </button>
          </div>
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] px-4 py-3 text-center text-[#0D2B35] bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }

  // Desktop popover
  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        ref={menuRef}
        className={`absolute right-0 ${shouldFlipUp ? 'bottom-full mb-1' : 'top-full mt-1'} w-56 bg-white border border-gray-200 rounded-lg shadow-[0_8px_28px_rgba(8,100,126,0.18)] z-[101] animate-fade-in`}
        role="menu"
        aria-label={`Options for ${memberName}`}
      >
        <div className="p-1">
          <button
            ref={removeButtonRef}
            type="button"
            onClick={() => {
              onClose();
              onRemove();
            }}
            className="w-full min-h-[36px] px-3 py-2 text-left text-red-600 hover:bg-red-50 rounded-md transition-colors text-sm font-medium"
            role="menuitem"
          >
            Remove from {contextLabel}
          </button>
        </div>
      </div>
    </>
  );
}
