import { initBotId } from "botid/client/core";

// Attaches Vercel BotID challenge headers to these requests; verified server-side
// with checkBotId(). Keep in sync with routes that call checkBotId().
initBotId({
  protect: [{ path: "/api/auth/send-magic-link", method: "POST" }],
});
