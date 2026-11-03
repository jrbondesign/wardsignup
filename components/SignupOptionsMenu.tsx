"use client";

import ActionMenu from "./ActionMenu";

interface SignupOptionsMenuProps {
  memberName: string;
  contextLabel: string;
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
  return (
    <ActionMenu
      title={`Options for ${memberName}`}
      items={[
        {
          label: `Remove from ${contextLabel}`,
          onSelect: onRemove,
          tone: "danger",
        },
      ]}
      onClose={onClose}
      buttonElement={buttonElement}
    />
  );
}
