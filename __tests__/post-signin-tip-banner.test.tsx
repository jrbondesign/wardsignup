/** @jest-environment jsdom */
import { render, screen, fireEvent } from "@testing-library/react";
import PostSignInTipBanner from "@/components/PostSignInTipBanner";
import { POST_SIGNIN_TIP_DISMISSED_KEY } from "@/lib/tip-jar";

jest.mock("@/components/BrandProvider", () => ({
  useBrand: () => ({
    id: "wardsignup",
    tipJarUrl: "https://venmo.com/u/jrbond",
    siteUrl: "https://wardsignup.com",
  }),
}));

describe("PostSignInTipBanner", () => {
  const prevEnabled = process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;

  beforeEach(() => {
    localStorage.clear();
    delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
    else process.env.NEXT_PUBLIC_TIP_JAR_ENABLED = prevEnabled;
  });

  it("links to Venmo tip jar", () => {
    render(<PostSignInTipBanner />);
    const link = screen.getByRole("link", { name: /tip on venmo/i });
    expect(link.getAttribute("href")).toContain("venmo.com/u/jrbond");
  });

  it("dismiss hides the banner", () => {
    render(<PostSignInTipBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(localStorage.getItem(POST_SIGNIN_TIP_DISMISSED_KEY)).toBe("1");
    expect(screen.queryByRole("link", { name: /tip on venmo/i })).toBeNull();
  });

  it("stays hidden when tip jar is disabled", () => {
    process.env.NEXT_PUBLIC_TIP_JAR_ENABLED = "0";
    render(<PostSignInTipBanner />);
    expect(screen.queryByRole("link", { name: /tip on venmo/i })).toBeNull();
  });
});
