import { PlatformError } from "./errors.js";

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function parseTime(value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new PlatformError("invalid_timestamp", `Invalid timestamp: ${value}`);
  }
  return time;
}
