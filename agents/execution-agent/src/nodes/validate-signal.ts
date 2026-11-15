import { TradingSignalSchema } from "@platform/contracts";
import { formatIssues, parseTime, resolvePlatform } from "@platform/common";
import { recordExecution } from "../audit.js";
import type { ExecutionState } from "../state.js";

export async function validateSignal(
  state: typeof ExecutionState.State,
  config: unknown,
): Promise<typeof ExecutionState.Update> {
  const platform = resolvePlatform(config);
  if (!state.signal) {
    return recordExecution(
      platform,
      "INVALID",
      ["No signal was provided"],
      null,
    );
  }
  const parsed = TradingSignalSchema.safeParse(state.signal);
  if (!parsed.success) {
    return recordExecution(
      platform,
      "INVALID",
      [formatIssues(parsed.error.issues)],
      null,
    );
  }
  const signal = parsed.data;
  if (parseTime(signal.expiresAt) <= Date.now()) {
    return recordExecution(
      platform,
      "INVALID",
      ["Signal has expired"],
      signal.signalId,
    );
  }
  if (parseTime(signal.expiresAt) <= parseTime(signal.createdAt)) {
    return recordExecution(
      platform,
      "INVALID",
      ["Signal expiry is not after its creation time"],
      signal.signalId,
    );
  }
  if (signal.action !== "HOLD" && signal.newsReferences.length === 0) {
    return recordExecution(
      platform,
      "INVALID",
      ["Actionable signals require source attribution"],
      signal.signalId,
    );
  }
  return { signal, status: "VALIDATED", reasons: [] };
}
