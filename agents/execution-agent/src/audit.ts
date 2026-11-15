import type { ExecutionStatus } from "@platform/contracts";
import type { Platform } from "@platform/common";
import { nowIso } from "@platform/common";
import type { ExecutionState } from "./state.js";

export async function recordExecution(
  platform: Platform,
  status: ExecutionStatus,
  reasons: string[],
  signalId: string | null,
): Promise<typeof ExecutionState.Update> {
  await platform.audit.record({
    type: "execution.decision",
    occurredAt: nowIso(),
    attributes: {
      status,
      signalId,
      reasons: reasons.join(" | "),
    },
  });
  return { status, reasons };
}
