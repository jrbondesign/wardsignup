/**
 * Guard: the create page, the dashboard and the marketing pages must not
 * mention AI, MCP or Claude in user facing copy (Jonathan, Nov 15, 2026).
 * Comments are stripped before checking so code notes do not trip it.
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function listPages(dir: string): string[] {
  const abs = path.join(root, dir);
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return listPages(rel);
      return /\.(tsx|ts)$/.test(e.name) ? [rel] : [];
    });
}

const files = [
  "app/create/page.tsx",
  "app/create/layout.tsx",
  "app/dashboard/page.tsx",
  "app/page.tsx",
  "app/layout.tsx",
  "components/HomePage.tsx",
  "components/MarketingFooter.tsx",
  "lib/brand/brands.ts",
  "app/faq/page.tsx",
  "app/about/page.tsx",
  "app/ad-free/page.tsx",
  "app/support-the-project/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  ...listPages("app/use-cases"),
  ...listPages("app/compare"),
].filter((f) => fs.existsSync(path.join(root, f)));

const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("no AI or MCP copy", () => {
  it("covers the create page, dashboard and marketing pages", () => {
    expect(files).toEqual(expect.arrayContaining(["app/create/page.tsx", "app/dashboard/page.tsx", "app/faq/page.tsx"]));
    expect(files.length).toBeGreaterThan(12);
  });

  it.each(files)("%s has no AI, MCP or Claude wording", (file) => {
    const src = stripComments(fs.readFileSync(path.join(root, file), "utf8"));
    expect(src).not.toMatch(/\bAI\b|\bA\.I\.|\bMCP\b|Model Context Protocol|\bClaude\b|ChatGPT|artificial intelligence/i);
  });

  it("does not ship llms.txt", () => {
    expect(fs.existsSync(path.join(root, "public/llms.txt"))).toBe(false);
  });
});
