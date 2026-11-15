import { TickerSchema } from "@platform/contracts";
import { PlatformError } from "./errors.js";

export function normalizeTicker(input: string): string {
  const ticker = input.trim().toUpperCase();
  const parsed = TickerSchema.safeParse(ticker);
  if (!parsed.success) {
    throw new PlatformError("invalid_ticker", `Invalid ticker: ${input}`);
  }
  return parsed.data;
}
