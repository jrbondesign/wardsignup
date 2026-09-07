"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import SlotEditor, { type SlotRow } from "@/components/create/SlotEditor";

const PLACEHOLDER_HINTS = ["Rolls & butter", "Green salad", "Setup crew", "Dessert", "Drinks"];

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

/** Items editor — a thin adapter over the shared SlotEditor. Items map their
 *  `itemLimit` onto the editor's generic `limit` field. */
export default function ItemsSection({ state, set }: Props) {
  if (state.eventType !== "items") return null;

  const rows: SlotRow[] = state.items.map((it) => ({
    label: it.label,
    section: it.section,
    limit: it.itemLimit,
    id: it.id,
    hasSignups: it.hasSignups,
  }));

  return (
    <SlotEditor
      rows={rows}
      onChange={(next) =>
        set({
          items: next.map((r) => ({
            label: r.label,
            section: r.section,
            itemLimit: r.limit,
            id: r.id,
            hasSignups: r.hasSignups,
          })),
        })
      }
      heading="Items / tasks people can claim"
      labelPlaceholders={PLACEHOLDER_HINTS}
      addLabel="Add another item"
      datalistId="item-section-options"
      removeDisabledTitle="Can't remove — people have already signed up for this item"
    />
  );
}
