import { render, screen } from "@testing-library/react";
import { CreatorsTable } from "@/components/metrics/CreatorsTable";

describe("admin metrics Creators table", () => {
  it("shows Ward/Unit, Organization and Calling side by side in that order", () => {
    render(
      <CreatorsTable
        creators={[{ email: "a@example.com", wardName: "Maple Ridge Ward", organization: "Elders Quorum", calling: "Bishop", events: 1, sessions: 2, signups: 3 }]}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Email", "Ward/Unit", "Organization", "Calling", "Events", "Sess.", "Signups"]);
    expect(screen.getByTestId("creator-ward").textContent).toBe("Maple Ridge Ward");
    expect(screen.getByTestId("creator-organization").textContent).toBe("Elders Quorum");
    expect(screen.getByTestId("creator-calling").textContent).toBe("Bishop");
    expect(screen.queryByTestId("identity-unavailable")).toBeNull();
  });

  it("shows Not set before the migration is applied", () => {
    render(
      <CreatorsTable
        creators={[{ email: "a@example.com", organization: "Primary", calling: null, wardName: null, events: 1, sessions: 0, signups: 0 }]}
        callingsAvailable={false}
        wardsAvailable={false}
      />,
    );
    expect(screen.getByTestId("creator-ward").textContent).toBe("Not set");
    expect(screen.getByTestId("creator-calling").textContent).toBe("Not set");
    expect(screen.getByTestId("creator-organization").textContent).toBe("Primary");
    expect(screen.getByTestId("identity-unavailable")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });
});
