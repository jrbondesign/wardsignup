import { isMissingColumnError } from "@/lib/missing-column";

describe("isMissingColumnError", () => {
  it("matches Postgres 42703 and PostgREST PGRST204", () => {
    expect(isMissingColumnError({ code: "42703", message: "column organizations.ward_name does not exist" }, "ward_name")).toBe(true);
    expect(
      isMissingColumnError({ code: "PGRST204", message: "Could not find the 'ward_name' column of 'organizations' in the schema cache" }, "ward_name"),
    ).toBe(true);
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
  });
  it("ignores other errors and other columns", () => {
    expect(isMissingColumnError({ code: "23514", message: "check constraint" }, "ward_name")).toBe(false);
    expect(isMissingColumnError({ code: "42703", message: "column organizations.slug does not exist" }, "ward_name")).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});
