import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const loader = pathToFileURL(
  path.join(import.meta.dirname, "test-loader.mjs"),
).href;

register(loader, import.meta.url);
