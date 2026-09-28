import { creatorNotifyAddress, welcomeReplyAddress } from "@/lib/founder-notify";

describe("founder notify addresses", () => {
  const prev = {
    notify: process.env.CREATOR_NOTIFY_TO,
    reply: process.env.WELCOME_REPLY_TO,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };

  afterEach(() => {
    process.env.CREATOR_NOTIFY_TO = prev.notify;
    process.env.WELCOME_REPLY_TO = prev.reply;
    process.env.NODE_ENV = prev.node;
    process.env.VERCEL_ENV = prev.vercel;
  });

  it("returns null in production when env is unset", () => {
    delete process.env.CREATOR_NOTIFY_TO;
    delete process.env.WELCOME_REPLY_TO;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    expect(creatorNotifyAddress()).toBeNull();
    expect(welcomeReplyAddress()).toBeNull();
  });

  it("uses env when set", () => {
    process.env.CREATOR_NOTIFY_TO = "ops@wardsignup.com";
    process.env.WELCOME_REPLY_TO = "hello@wardsignup.com";
    process.env.VERCEL_ENV = "production";
    expect(creatorNotifyAddress()).toBe("ops@wardsignup.com");
    expect(welcomeReplyAddress()).toBe("hello@wardsignup.com");
  });
});
