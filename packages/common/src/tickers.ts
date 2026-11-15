import { readFileSync } from "node:fs";
import { PlatformError } from "./errors.js";
import { repoPath } from "./path.js";
import { normalizeTicker } from "./ticker.js";

export function loadTickers(filePath?: string): string[] {
  const path =
    filePath ??
    repoPath(import.meta.url, "infrastructure", "config", "tickers.json");
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new PlatformError("invalid_config", "Ticker config must be an array");
  }
  return raw.map((item) => {
    if (typeof item !== "string") {
      throw new PlatformError(
        "invalid_config",
        "Ticker config must contain strings",
      );
    }
    return normalizeTicker(item);
  });
}
