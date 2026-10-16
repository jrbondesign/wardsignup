import { initBotId } from "botid/client/core";

// Attaches Vercel BotID challenge headers to these requests; verified server-side
// with checkBotId(). Keep in sync with routes that call checkBotId().
// Test-only: skip bot check in preview environments when DISABLE_BOTID_FOR_TESTS=1
const skipBotCheck =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" &&
  process.env.NEXT_PUBLIC_DISABLE_BOTID_FOR_TESTS === "1";

if (!skipBotCheck) {
  initBotId({
    protect: [{ path: "/api/auth/send-magic-link", method: "POST" }],
  });
}
