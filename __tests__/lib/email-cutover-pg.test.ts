import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Runs only when a local Postgres server is reachable (directly or via sudo -n).
// psql alone is not enough: the box and most CI images have the client only.
const psql = existsSync("/usr/bin/psql");
const serverUp =
  psql &&
  spawnSync("bash", ["-c", "pg_isready -q 2>/dev/null || sudo -n -u postgres pg_isready -q 2>/dev/null"], {
    timeout: 10_000,
  }).status === 0;

(serverUp ? describe : describe.skip)("cutover migration on disposable local postgres", () => {
  it("reserves, recovers, and denies anon without a hosted database", () => {
    const output = execFileSync("bash", ["scripts/email-cutover-pg-proof.sh"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(output).toContain("email-cutover postgres proof ok");
  }, 120_000);
});
