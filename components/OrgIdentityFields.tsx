"use client";

import CallingField from "@/components/CallingField";
import { WARD_NAME_MAX_LENGTH } from "@/lib/ward-name";

export const ORG_NAME_HINT = "For example, Elders Quorum, Relief Society, Bishopric or Primary.";
export const WARD_NAME_HINT = "Your ward, branch or stake.";
export const OWNER_ONLY_HINT = "Only the owner can change this.";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60 bg-white disabled:bg-[#F4FAFB] disabled:cursor-not-allowed";
const labelClass = "block text-[12px] font-semibold text-[#0D2B35] mb-1.5";
const hintClass = "mt-1.5 text-[11px] text-[#5A8399]";

interface OrgIdentityFieldsProps {
  name: string;
  onNameChange: (v: string) => void;
  wardName: string;
  onWardNameChange: (v: string) => void;
  callingChoice: string;
  callingOther: string;
  onCallingChoiceChange: (v: string) => void;
  onCallingOtherChange: (v: string) => void;
  /** Org name and Ward/Unit are owner only; calling is per person. */
  canEditOrg: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Prefix for element ids so two instances never collide. */
  idPrefix: string;
}

/**
 * Ward/Unit, Organization and Your calling, in that order: one row of three on
 * desktop, stacked in the same order on mobile. Used by the first run window and
 * org settings.
 */
export default function OrgIdentityFields({
  name,
  onNameChange,
  wardName,
  onWardNameChange,
  callingChoice,
  callingOther,
  onCallingChoiceChange,
  onCallingOtherChange,
  canEditOrg,
  disabled,
  autoFocus,
  idPrefix,
}: OrgIdentityFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="org-identity-fields">
      <div>
        <label htmlFor={`${idPrefix}-ward`} className={labelClass}>
          Ward/Unit
        </label>
        <input
          id={`${idPrefix}-ward`}
          type="text"
          value={wardName}
          onChange={(e) => onWardNameChange(e.target.value)}
          disabled={disabled || !canEditOrg}
          placeholder="e.g. Sossaman Estates Ward"
          maxLength={WARD_NAME_MAX_LENGTH}
          autoFocus={autoFocus}
          className={inputClass}
        />
        <p className={hintClass}>{canEditOrg ? WARD_NAME_HINT : OWNER_ONLY_HINT}</p>
      </div>
      <div>
        <label htmlFor="org-name" className={labelClass}>
          Organization
        </label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={disabled || !canEditOrg}
          placeholder="e.g. Elders Quorum"
          maxLength={120}
          className={inputClass}
        />
        <p className={hintClass}>{canEditOrg ? ORG_NAME_HINT : OWNER_ONLY_HINT}</p>
      </div>
      <CallingField
        idPrefix={`${idPrefix}-calling`}
        choice={callingChoice}
        otherText={callingOther}
        onChoiceChange={onCallingChoiceChange}
        onOtherTextChange={onCallingOtherChange}
        disabled={disabled}
      />
    </div>
  );
}
