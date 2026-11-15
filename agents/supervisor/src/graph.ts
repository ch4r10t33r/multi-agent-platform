import { StateGraph } from "@langchain/langgraph";
import type {
  ExecutionStatus,
  NewsUpdatedEvent,
  OrderRecord,
} from "@platform/contracts";
import {
  errorMessage,
  normalizeTicker,
  nowIso,
  parseTime,
  resolvePlatform,
} from "@platform/common";
import type { EventBus } from "@platform/shared-state";
import { graph as executionGraph } from "@platform/execution-agent";
import { graph as researchGraph } from "@platform/research-agent";
import { OrchestratorState } from "./state.js";

async function runResearch(
  state: typeof OrchestratorState.State,
  config: unknown,
): Promise<typeof OrchestratorState.Update> {
  const platform = resolvePlatform(config);
  const ticker = normalizeTicker(state.ticker);
  const portfolio = await platform.broker.getPortfolio();
  const positionQuantity =
    portfolio.positions.find((position) => position.ticker === ticker)
      ?.quantity ?? 0;
  const result = await researchGraph.invoke(
    { ticker, positionQuantity },
    { configurable: { platform } },
  );
  return {
    ticker,
    signal: result.signal,
    reasons: result.error ? [result.error] : [],
  };
}

function gateSignal(
  state: typeof OrchestratorState.State,
): typeof OrchestratorState.Update {
  if (!state.signal) {
    return {
      executionStatus: "INVALID",
      reasons:
        state.reasons.length > 0
          ? state.reasons
          : ["Research did not produce a signal"],
    };
  }
  if (state.signal.action === "HOLD") {
    return { executionStatus: "SKIPPED", reasons: ["Research returned HOLD"] };
  }
  if (parseTime(state.signal.expiresAt) <= Date.now()) {
    return {
      executionStatus: "INVALID",
      reasons: ["Signal expired before execution"],
    };
  }
  return { executionStatus: "VALIDATED", reasons: [] };
}

async function runExecution(
  state: typeof OrchestratorState.State,
  config: unknown,
): Promise<typeof OrchestratorState.Update> {
  if (!state.signal) return {};
  const platform = resolvePlatform(config);
  const result = await executionGraph.invoke(
    { signal: state.signal, approval: state.approval },
    { configurable: { platform } },
  );
  return {
    order: result.order,
    executionStatus: result.status,
    reasons: result.reasons,
  };
}

async function persistResult(
  state: typeof OrchestratorState.State,
  config: unknown,
): Promise<typeof OrchestratorState.Update> {
  const platform = resolvePlatform(config);
  if (state.signal) {
    await platform.signals.save(state.signal);
    await platform.events.publish({
      type: "signal.created",
      signalId: state.signal.signalId,
      ticker: state.signal.ticker,
      action: state.signal.action,
      occurredAt: state.signal.createdAt,
    });
  }
  await platform.audit.record({
    type: "orchestrator.completed",
    occurredAt: nowIso(),
    attributes: {
      ticker: state.ticker,
      status: state.executionStatus,
      signalId: state.signal?.signalId ?? null,
      orderId: state.order?.orderId ?? null,
    },
  });
  return {};
}

function afterGate(
  state: typeof OrchestratorState.State,
): "execute" | "persist" {
  return state.executionStatus === "VALIDATED" ? "execute" : "persist";
}

const builder = new StateGraph(OrchestratorState)
  .addNode("research", runResearch)
  .addNode("gate", gateSignal)
  .addNode("execute", runExecution)
  .addNode("persist", persistResult)
  .addEdge("__start__", "research")
  .addEdge("research", "gate")
  .addConditionalEdges("gate", afterGate)
  .addEdge("execute", "persist")
  .addEdge("persist", "__end__");

export const graph = builder.compile({
  name: "trading_orchestrator",
  description:
    "Coordinates research and execution. Research cannot submit orders, and execution cannot bypass the risk engine.",
});

export async function approveSignal(
  signalId: string,
  approval: "granted" | "denied",
  config: unknown,
): Promise<ExecutionStateResult> {
  const platform = resolvePlatform(config);
  const signal = await platform.signals.get(signalId);
  if (!signal)
    return {
      status: "INVALID",
      order: null,
      reasons: ["Signal was not found"],
    };
  try {
    const result = await executionGraph.invoke(
      { signal, approval },
      { configurable: { platform } },
    );
    return {
      status: result.status,
      order: result.order,
      reasons: result.reasons,
    };
  } catch (error) {
    return { status: "FAILED", order: null, reasons: [errorMessage(error)] };
  }
}

interface ExecutionStateResult {
  status: ExecutionStatus;
  order: OrderRecord | null;
  reasons: string[];
}

export function onNewsUpdated(
  events: EventBus,
  handle: (event: NewsUpdatedEvent) => Promise<void>,
): () => void {
  return events.subscribe("news.updated", handle);
}
