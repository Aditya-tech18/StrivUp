import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase Edge Functions run on Deno, not Next/Node: they use jsr:
    // specifiers and the Deno global, which this config cannot resolve.
    // They are linted by `deno lint` and are already excluded in tsconfig.json.
    "supabase/functions/**",
  ]),
  // Must be last — disables ESLint formatting rules that conflict with Prettier.
  prettier,
]);

export default eslintConfig;
