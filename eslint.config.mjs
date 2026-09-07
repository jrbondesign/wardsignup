import next from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: [".claude/**"] },
  ...next,
  {
    rules: {
      // Project copy uses apostrophes/quotes in JSX; escaping hurts readability.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
