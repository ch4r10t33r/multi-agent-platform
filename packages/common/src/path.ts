import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve a repo-root path from a module URL, then from the process cwd. */
export function repoPath(moduleUrl: string, ...segments: string[]): string {
  const here = dirname(fileURLToPath(moduleUrl));
  const fromModule = join(here, "..", "..", "..", ...segments);
  if (existsSync(fromModule)) return fromModule;
  return join(process.cwd(), ...segments);
}
