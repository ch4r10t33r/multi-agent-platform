import { resolvePlatform } from "@platform/common";
import { recordExecution } from "../audit.js";
import type { ExecutionState } from "../state.js";

export async function requestApproval(
  state: typeof ExecutionState.State,
  config: unknown,
): Promise<typeof ExecutionState.Update> {
  if (
    state.status !== "RISK_APPROVED" ||
    state.decision?.status !== "approved" ||
    !state.signal
  ) {
    return {};
  }
  const platform = resolvePlatform(config);
  if (state.approval === "denied") {
    return recordExecution(
      platform,
      "REJECTED",
      ["Human approval was denied"],
      state.signal.signalId,
    );
  }
  if (state.decision.requiresHumanApproval && state.approval !== "granted") {
    return recordExecution(
      platform,
      "PENDING_APPROVAL",
      ["Human approval is required before this order can be submitted"],
      state.signal.signalId,
    );
  }
  return { status: "APPROVED", reasons: state.decision.reasons };
}
