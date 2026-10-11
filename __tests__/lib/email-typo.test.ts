import { suggestEmailFix } from "@/lib/email-typo";

describe("suggestEmailFix", () => {
  it.each([
    ["ar@gmail.co", "ar@gmail.com"],
    ["So@Yaho.com", "so@yahoo.com"],
    ["ld@joos.prg", "ld@joos.org"],
    ["x@hotmial.com", "x@hotmail.com"],
    ["x@example.con", "x@example.com"],
    ["x@comcast.met", "x@comcast.net"],
  ])("suggests a fix for %s", (input, fixed) => {
    expect(suggestEmailFix(input)).toBe(fixed);
  });

  it.each(["a@gmail.com", "a@yahoo.com", "a@ward.org", "nope", "a@", ""])(
    "leaves %s alone",
    (input) => {
      expect(suggestEmailFix(input)).toBeNull();
    },
  );
});
