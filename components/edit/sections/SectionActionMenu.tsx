"use client";

import { groupSessionsForDisplay } from "@/lib/edit-session-classes";
import { sectionSlotIndices } from "@/lib/edit-slot-actions";
import ActionMenu from "@/components/ActionMenu";
import MenuStepForm from "@/components/edit/MenuStepForm";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Per-section action menu (rename, duplicate, remove). */
export default function SectionActionMenu({ ctx }: { ctx: EditEventCtx }) {
  const {
    duplicateSection,
    removeSectionOnDay,
    renameSectionOnDay,
    sectionMenu,
    sectionMenuButtonEl,
    sectionMenuStep,
    sectionRenameDraft,
    sessions,
    setSectionMenu,
    setSectionMenuStep,
    setSectionRenameDraft,
  } = ctx;

  return (
    sectionMenu && sectionMenuButtonEl && (() => {
    const { groupKey, section } = sectionMenu;
    const group = groupSessionsForDisplay(sessions).find((g) => g.key === groupKey);
    if (!group || sectionSlotIndices(sessions, groupKey, section).length === 0) return null;
    const closeSectionMenu = () => {
      setSectionMenu(null);
      setSectionMenuStep(null);
    };

    if (sectionMenuStep === "rename") {
      const draft = sectionRenameDraft.trim();
      return (
        <ActionMenu
          title="Rename section"
          items={[]}
          onClose={closeSectionMenu}
          buttonElement={sectionMenuButtonEl}
          secondStepContent={
            <MenuStepForm
              title="Rename section"
              helper="Every slot in this section on this day gets the new name."
              confirmLabel="Save"
              confirmDisabled={draft === ""}
              onCancel={closeSectionMenu}
              onConfirm={() => {
                renameSectionOnDay(groupKey, section, draft);
                closeSectionMenu();
              }}
            >
              <input
                type="text"
                autoFocus
                aria-label="Section name"
                list="edit-session-sections"
                value={sectionRenameDraft}
                onChange={(e) => setSectionRenameDraft(e.target.value)}
                className="w-full text-sm text-[#0D2B35] px-3 py-2.5 border-[1.5px] border-[#0E96B0] rounded-lg bg-white outline-none"
              />
            </MenuStepForm>
          }
        />
      );
    }

    return (
      <ActionMenu
        title={section}
        items={[
          {
            label: "Duplicate section",
            onSelect: () => {
              closeSectionMenu();
              duplicateSection(group, section);
            },
          },
          {
            label: "Rename section",
            closeOnSelect: false,
            onSelect: () => {
              setSectionRenameDraft(section);
              setSectionMenuStep("rename");
            },
          },
          {
            label: "Remove section",
            tone: "danger",
            onSelect: () => {
              closeSectionMenu();
              removeSectionOnDay(groupKey, section);
            },
          },
        ]}
        onClose={closeSectionMenu}
        buttonElement={sectionMenuButtonEl}
      />
    );
  })()
  );
}
