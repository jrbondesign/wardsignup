import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("geography map surfaces share one path", () => {
  it("homepage and founder metrics both render PublicGeographyMap", () => {
    const home = read("components/HomePage.tsx");
    const metrics = read("app/admin/metrics/page.tsx");
    expect(home).toContain('import("@/components/PublicGeographyMap")');
    expect(home).toContain("<PublicGeographyMap");
    expect(metrics).toContain('import("@/components/PublicGeographyMap")');
    expect(metrics).toContain("<PublicGeographyMap");
    expect(metrics).not.toContain('@/components/GeographyMap');
    expect(metrics).not.toContain("<GeographyMap");
  });

  it("PublicGeographyMap reads only the public snapshot endpoint", () => {
    const map = read("components/PublicGeographyMap.tsx");
    expect(map).toContain('fetch("/api/geography/public"');
    expect(map).toContain('cache: "no-store"');
    expect(map).not.toContain('"/api/geography"');
    expect(map).toContain("geography-map-updated");
  });

  it("deleted the old founder-only GeographyMap component", () => {
    expect(fs.existsSync(path.join(root, "components/GeographyMap.tsx"))).toBe(
      false,
    );
  });
});
