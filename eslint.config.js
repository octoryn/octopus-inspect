// ESLint flat config for octopus-inspect.
//
// Pragmatic, NON type-checked ruleset: typescript-eslint's `recommended` (fast,
// fewer false positives) layered on `eslint:recommended`. The codebase already
// passes `tsc` under full strict flags, so the type system covers the heavy
// correctness checks; ESLint here catches the lint-class problems tsc does not
// (unused locals/imports, accidental constant conditions, never-reassigned
// bindings, etc.). Type-checked rules (e.g. no-floating-promises) are
// intentionally not enabled, to keep lint fast and false-positive-free.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "inspect-plugins/dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "prefer-const": "error",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
