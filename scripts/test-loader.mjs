import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const candidates = [".ts", ".tsx", ".js"];
    for (const ext of candidates) {
      const full = path.join(root, "src", rel + ext);
      return nextResolve(pathToFileURL(full).href, context);
    }
  }
  return nextResolve(specifier, context);
}
