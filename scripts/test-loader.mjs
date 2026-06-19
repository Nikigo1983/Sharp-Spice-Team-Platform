import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const root = path.resolve(import.meta.dirname, "..");

function resolveWithExtensions(basePath) {
  for (const ext of [".ts", ".tsx", ".js", ""]) {
    const full = ext ? basePath + ext : basePath;
    if (existsSync(full)) {
      return pathToFileURL(full).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(root, "scripts", "server-only-stub.mjs")).href,
    };
  }

  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const href = resolveWithExtensions(path.join(root, "src", rel));
    if (href) return nextResolve(href, context);
  }

  if (specifier.startsWith(".") && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const href = resolveWithExtensions(path.resolve(parentDir, specifier));
    if (href) return nextResolve(href, context);
  }

  return nextResolve(specifier, context);
}
