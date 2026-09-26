// Node's native ESM resolver requires explicit extensions; the app's own
// source uses extensionless relative imports (bundler-style), so plain
// `node --experimental-strip-types` cannot import it as-is. This hook makes
// bare/extensionless relative specifiers resolve to their sibling .ts file
// when the exact specifier does not resolve on its own. Analysis-only:
// nothing under holto-chess/ is read or modified by this file itself.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw err;
    const base = specifier.startsWith(".") ? new URL(specifier, context.parentURL) : pathToFileURL(specifier);
    const path = fileURLToPath(base);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(path + ext)) return nextResolve(specifier + ext, context);
    }
    throw err;
  }
}
