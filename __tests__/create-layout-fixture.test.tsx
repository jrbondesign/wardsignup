/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isCreateLayoutFixtureEnabled } from "@/app/demo/create-layout/page";
import CreateLayoutFixture from "@/app/demo/create-layout/CreateLayoutFixture";

const formSubmit = jest.fn((e: React.FormEvent) => {
  e.preventDefault();
});

jest.mock("@/components/create/UnifiedCreateForm", () => ({
  __esModule: true,
  default: function MockForm() {
    return (
      <form onSubmit={formSubmit}>
        <button type="submit">Continue →</button>
      </form>
    );
  },
}));

describe("isCreateLayoutFixtureEnabled", () => {
  it("is off when VERCEL_ENV is production, even with LAYOUT_FIXTURE=1", () => {
    expect(
      isCreateLayoutFixtureEnabled({
        VERCEL_ENV: "production",
        NODE_ENV: "production",
        LAYOUT_FIXTURE: "1",
      })
    ).toBe(false);
  });

  it("is on for Vercel preview", () => {
    expect(isCreateLayoutFixtureEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
  });

  it("is on for local next dev", () => {
    expect(isCreateLayoutFixtureEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("is off for a local production build unless LAYOUT_FIXTURE=1", () => {
    expect(isCreateLayoutFixtureEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isCreateLayoutFixtureEnabled({ NODE_ENV: "production", LAYOUT_FIXTURE: "1" })).toBe(true);
  });
});

describe("CreateLayoutFixture", () => {
  beforeEach(() => formSubmit.mockClear());

  it("stops the real create form submit from running", async () => {
    const user = userEvent.setup();
    render(<CreateLayoutFixture />);
    await user.click(screen.getByRole("button", { name: "Continue →" }));
    expect(formSubmit).not.toHaveBeenCalled();
  });
});
