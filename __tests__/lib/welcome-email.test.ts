import { buildWelcomeEmail } from "@/lib/welcome-email";
import { WELCOME_REMINDERS_LINE } from "@/lib/reminder-copy";

const input = {
  firstName: "Ann <b>",
  quickPlain: "Create an event and share the link.",
  brandName: "WardSignup",
  siteHost: "wardsignup.com",
  siteUrlWithUtm: "https://wardsignup.com/?utm_source=email",
};

const MEMBERS = "✨ Members don't need an account. They just open your link, pick a slot, and enter their name.";

describe("buildWelcomeEmail", () => {
  it("adds the reminders line right after the members line in the text body", () => {
    const { text } = buildWelcomeEmail(input);
    expect(text).toContain(`${MEMBERS}\n\n${WELCOME_REMINDERS_LINE}\n\nThis is free to use`);
    expect(text.split(WELCOME_REMINDERS_LINE)).toHaveLength(2);
    expect(text.startsWith("Hi Ann <b>,")).toBe(true);
  });

  it("adds the reminders line right after the members line in the html body", () => {
    const { html } = buildWelcomeEmail(input);
    const members = html.indexOf(MEMBERS);
    const line = html.indexOf(WELCOME_REMINDERS_LINE);
    const free = html.indexOf("This is free to use");
    expect(members).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(members);
    expect(free).toBeGreaterThan(line);
    expect(html).toContain("Hi Ann &lt;b&gt;,");
    expect(html).toContain('href="https://wardsignup.com/?utm_source=email"');
  });
});
