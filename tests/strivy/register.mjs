/**
 * Test-only module resolution for STRIVY's node:test suite.
 *
 * Node runs the TypeScript sources directly (--experimental-strip-types), but
 * Node's resolver doesn't know the `@/` path alias or extensionless imports.
 * This hook maps `@/x` to `src/x` and tries `.ts` for extensionless paths.
 * No test framework or extra package is needed.
 */
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = ${JSON.stringify(new URL("../../", import.meta.url).href)};
export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = new URL("src/" + spec.slice(2), root).href;
  const isPath = spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("file:");
  if (isPath && !/\\.(m?js|ts|json)$/.test(spec)) {
    const base = new URL(spec, context.parentURL);
    for (const ext of [".ts", "/index.ts"]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
  }
  return next(spec, context);
}
`),
  import.meta.url
);
