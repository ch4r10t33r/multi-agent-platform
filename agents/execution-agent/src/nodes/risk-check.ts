import { errorMessage, resolvePlatform } from "@platform/common";
import { assessRisk } from "@platform/risk";
import { recordExecution } from "../audit.js";
import type { ExecutionState } from "../state.js";

export async function riskCheck(
  state: typeof ExecutionState.State,
  config: unknown,
): Promise<typeof ExecutionState.Update> {
  if (state.status !== "VALIDATED" || !state.signal) return {};
  const platform = resolvePlatform(config);
  const health = await platform.broker.health();
  try {
    const quote = await platform.quotes.getQuote(state.signal.ticker);
    const portfolio = await platform.broker.getPortfolio();
    const decision = assessRisk({
      signal: state.signal,
      quote,
      portfolio,
      policy: platform.policy,
      now: new Date(),
      brokerHealthy: health.ok,
      liveRequested: false,
    });
    if (decision.status === "approved") {
      return { decision, status: "RISK_APPROVED", reasons: decision.reasons };
    }
    const status = decision.status === "skipped" ? "SKIPPED" : "REJECTED";
    return {
      decision,
      ...(await recordExecution(
        platform,
        status,
        decision.reasons,
        state.signal.signalId,
      )),
    };
  } catch (error) {
    return recordExecution(
      platform,
      "REJECTED",
      [errorMessage(error)],
      state.signal.signalId,
    );
  }
}
