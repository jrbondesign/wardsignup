"use client";

import type { ReactNode } from "react";

interface MenuStepFormProps {
  title: string;
  helper: string;
  /** The field (date input, text input). */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
}

/** Second step inside an ActionMenu (Change date, Duplicate day, Rename
 *  section): title, helper, one field, Cancel and a primary button. */
export default function MenuStepForm({
  title,
  helper,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: MenuStepFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirmDisabled) onConfirm();
      }}
    >
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-base font-bold text-[#0D2B35]">{title}</h3>
        <p className="text-sm text-[#5A8399] mt-1">{helper}</p>
      </div>
      <div className="p-4">{children}</div>
      <div className="px-4 pb-4 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#0D2B35] bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={confirmDisabled}
          className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#0E96B0] hover:bg-[#08647E] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}
