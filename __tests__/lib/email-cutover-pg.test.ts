import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const psql = existsSync("/usr/bin/psql");

(psql ? describe : describe.skip)("cutover migration on disposable local postgres", () => {
  it("reserves, recovers, and denies anon without a hosted database", () => {
    const output = execFileSync("bash", ["scripts/email-cutover-pg-proof.sh"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(output).toContain("email-cutover postgres proof ok");
  }, 60_000);
});
