"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface SignupOptionsMenuProps {
  memberName: string;
  contextLabel: string; // "Session Name" or "Item Name"
  onRemove: () => void;
  onClose: () => void;
  buttonElement: HTMLElement | null;
}

export default function SignupOptionsMenu({
  memberName,
  contextLabel,
  onRemove,
  onClose,
  buttonElement,
}: SignupOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkMobile = () => window.innerWidth < 768;
    
    const calculatePosition = () => {
      if (checkMobile() || !buttonElement) return null;

      const buttonRect = buttonElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const menuWidth = 280; // Min width to fit "Remove from the 5:00 to 7:00 PM slot"
      const menuHeight = 60; // Approximate menu height
      const gap = 4;

      const spaceBelow = viewportHeight - buttonRect.bottom;
      const flipUp = spaceBelow < menuHeight + gap + 10;

      // Right-align menu to button with gap
      let left = buttonRect.right - menuWidth;
      let top = flipUp ? buttonRect.top - menuHeight - gap : buttonRect.bottom + gap;

      // Clamp to viewport bounds
      const minLeft = 8; // 8px padding from edge
      const maxLeft = viewportWidth - menuWidth - 8;
      left = Math.max(minLeft, Math.min(left, maxLeft));

      // Clamp top
      const minTop = 8;
      const maxTop = viewportHeight - menuHeight - 8;
      top = Math.max(minTop, Math.min(top, maxTop));

      return { left, top, flipUp };
    };

    const updatePosition = () => {
      const mobile = checkMobile();
      setIsMobile(mobile);
      
      if (!mobile && buttonElement) {
        const pos = calculatePosition();
        if (pos) {
          setMenuPosition(pos);
        }
      }
    };

    // Initial position
    updatePosition();

    const handleResize = () => {
      updatePosition();
    };

    const handleScroll = () => {
      updatePosition();
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
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    // Focus the Remove button when menu opens
    setTimeout(() => removeButtonRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, buttonElement]);

  if (!mounted) return null;

  if (isMobile) {
    // Bottom sheet on mobile
    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/30 z-[100] animate-fade-in" onClick={onClose} />
        <div
          ref={menuRef}
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-8px_28px_rgba(8,100,126,0.18)] z-[101] animate-slide-up pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="menu"
          aria-label={`Options for ${memberName}`}
        >
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-base font-bold text-[#0D2B35]">Options for {memberName}</h3>
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
      </>,
      document.body
    );
  }

  // Desktop popover in portal with fixed positioning
  if (!menuPosition) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed bg-white border border-gray-200 rounded-lg shadow-[0_8px_28px_rgba(8,100,126,0.18)] z-[101] animate-fade-in"
        style={{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          minWidth: '280px',
        }}
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
            className="w-full min-h-[36px] px-3 py-2 text-left text-red-600 hover:bg-red-50 rounded-md transition-colors text-sm font-medium whitespace-nowrap"
            role="menuitem"
          >
            Remove from {contextLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
