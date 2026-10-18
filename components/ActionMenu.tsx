"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
}

interface ActionMenuProps {
  title: string;
  items: ActionMenuItem[];
  onClose: () => void;
  buttonElement: HTMLElement | null;
  secondStepContent?: ReactNode;
}

export default function ActionMenu({
  title,
  items,
  onClose,
  buttonElement,
  secondStepContent,
}: ActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
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
      const menuWidth = 280;
      const menuHeight = items.length * 44 + 8;
      const gap = 4;

      const spaceBelow = viewportHeight - buttonRect.bottom;
      const flipUp = spaceBelow < menuHeight + gap + 10;

      let left = buttonRect.right - menuWidth;
      let top = flipUp ? buttonRect.top - menuHeight - gap : buttonRect.bottom + gap;

      const minLeft = 8;
      const maxLeft = viewportWidth - menuWidth - 8;
      left = Math.max(minLeft, Math.min(left, maxLeft));

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

    setTimeout(() => firstButtonRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, buttonElement, items.length]);

  if (!mounted) return null;

  if (secondStepContent) {
    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/30 z-[100] animate-fade-in" onClick={onClose} />
        <div
          ref={menuRef}
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-8px_28px_rgba(8,100,126,0.18)] z-[101] animate-slide-up pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-label={title}
        >
          {secondStepContent}
        </div>
      </>,
      document.body
    );
  }

  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/30 z-[100] animate-fade-in" onClick={onClose} />
        <div
          ref={menuRef}
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-8px_28px_rgba(8,100,126,0.18)] z-[101] animate-slide-up pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="menu"
          aria-label={title}
        >
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-base font-bold text-[#0D2B35]">{title}</h3>
          </div>
          <div className="p-2">
            {items.map((item, idx) => (
              <button
                key={idx}
                ref={idx === 0 ? firstButtonRef : undefined}
                type="button"
                onClick={() => {
                  onClose();
                  item.onSelect();
                }}
                className={`w-full min-h-[44px] px-4 py-3 text-left rounded-lg transition-colors text-sm font-medium ${
                  item.tone === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-[#0D2B35] hover:bg-gray-50"
                }`}
                role="menuitem"
              >
                {item.label}
              </button>
            ))}
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
        aria-label={title}
      >
        <div className="p-1">
          {items.map((item, idx) => (
            <button
              key={idx}
              ref={idx === 0 ? firstButtonRef : undefined}
              type="button"
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={`w-full min-h-[36px] px-3 py-2 text-left rounded-md transition-colors text-sm font-medium whitespace-nowrap ${
                item.tone === "danger"
                  ? "text-red-600 hover:bg-red-50"
                  : "text-[#0D2B35] hover:bg-gray-50"
              }`}
              role="menuitem"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}
