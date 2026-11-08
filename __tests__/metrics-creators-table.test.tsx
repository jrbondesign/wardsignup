import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatorsTable } from "@/components/metrics/CreatorsTable";

const row = {
  email: "a@example.com",
  wardName: "Maple Ridge Ward",
  organization: "Elders Quorum",
  calling: "Bishop",
  events: 1,
  sessions: 2,
  signups: 3,
};

describe("admin metrics Creators table", () => {
  it("shows Email, Ward/Unit, and Organization, with the other fields behind Details", async () => {
    const user = userEvent.setup();
    render(<CreatorsTable creators={[row]} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Email",
      "Ward/Unit",
      "Organization",
    ]);
    const primary = screen.getByTestId("creator-row");
    expect(primary.querySelectorAll(":scope > td")).toHaveLength(3);
    expect(primary).toContainElement(screen.getByRole("button", { name: "Details for a@example.com" }));
    expect(screen.getByTestId("creator-ward").textContent).toBe("Maple Ridge Ward");
    expect(screen.getByTestId("creator-organization").textContent).toBe("Elders Quorum");
    expect(screen.queryByTestId("creator-calling")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Calling" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Sess." })).toBeNull();

    const details = screen.getByRole("button", { name: "Details for a@example.com" });
    details.focus();
    await user.keyboard("{Enter}");
    expect(details).toHaveFocus();
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("creator-calling").textContent).toBe("Bishop");
    expect(screen.getByTestId("creator-events").textContent).toBe("1");
    expect(screen.getByTestId("creator-sessions").textContent).toBe("2");
    expect(screen.getByTestId("creator-signups").textContent).toBe("3");
    expect(screen.getByRole("region", { name: "Details for a@example.com" })).toBeInTheDocument();

    await user.keyboard(" ");
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(details).toHaveFocus();
    expect(screen.queryByTestId("creator-calling")).toBeNull();

    const scroll = screen.getByTestId("metrics-hscroll");
    expect(scroll.getAttribute("data-metrics-scroll")).toBe("creators");
    expect(scroll.className).toContain("overflow-x-auto");
    expect(scroll.className).toContain("min-w-0");
    expect(scroll.querySelector("table")?.className).toContain("min-w-[22rem]");
    expect(scroll.querySelector("table")?.className).not.toContain("min-w-[720px]");
    expect(screen.queryByTestId("identity-unavailable")).toBeNull();
  });

  it("keeps each row's details independent", async () => {
    const user = userEvent.setup();
    render(
      <CreatorsTable
        creators={[
          row,
          { ...row, email: "b@example.com", calling: "President", events: 4, sessions: 5, signups: 6 },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Details for a@example.com" }));
    await user.click(screen.getByRole("button", { name: "Details for b@example.com" }));
    const callings = screen.getAllByTestId("creator-calling").map((el) => el.textContent);
    expect(callings).toEqual(["Bishop", "President"]);
    expect(screen.getAllByTestId("creator-events").map((el) => el.textContent)).toEqual(["1", "4"]);
  });

  it("shows Not set before the migration is applied", async () => {
    const user = userEvent.setup();
    render(
      <CreatorsTable
        creators={[{ email: "a@example.com", organization: "Primary", calling: null, wardName: null, events: 1, sessions: 0, signups: 0 }]}
        callingsAvailable={false}
        wardsAvailable={false}
      />,
    );
    expect(screen.getByTestId("creator-ward").textContent).toBe("Not set");
    expect(screen.getByTestId("creator-organization").textContent).toBe("Primary");
    expect(screen.getByTestId("identity-unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details for a@example.com" }));
    expect(screen.getByTestId("creator-calling").textContent).toBe("Not set");
    expect(screen.getByTestId("creator-events").textContent).toBe("1");
    expect(screen.getByTestId("creator-sessions").textContent).toBe("0");
    expect(screen.getByTestId("creator-signups").textContent).toBe("0");
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });
});
