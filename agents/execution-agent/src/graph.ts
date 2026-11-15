import { StateGraph } from "@langchain/langgraph";
import { requestApproval } from "./nodes/request-approval.js";
import { riskCheck } from "./nodes/risk-check.js";
import { submitOrder } from "./nodes/submit-order.js";
import { validateSignal } from "./nodes/validate-signal.js";
import { ExecutionState } from "./state.js";

function afterValidation(
  state: typeof ExecutionState.State,
): "risk_check" | "__end__" {
  return state.status === "VALIDATED" ? "risk_check" : "__end__";
}

function afterRisk(
  state: typeof ExecutionState.State,
): "request_approval" | "__end__" {
  return state.status === "RISK_APPROVED" ? "request_approval" : "__end__";
}

function afterApproval(
  state: typeof ExecutionState.State,
): "submit_order" | "__end__" {
  return state.status === "APPROVED" ? "submit_order" : "__end__";
}

const builder = new StateGraph(ExecutionState)
  .addNode("validate_signal", validateSignal)
  .addNode("risk_check", riskCheck)
  .addNode("request_approval", requestApproval)
  .addNode("submit_order", submitOrder)
  .addEdge("__start__", "validate_signal")
  .addConditionalEdges("validate_signal", afterValidation)
  .addConditionalEdges("risk_check", afterRisk)
  .addConditionalEdges("request_approval", afterApproval)
  .addEdge("submit_order", "__end__");

export const graph = builder.compile({
  name: "execution_agent",
  description:
    "Validates a signal with deterministic risk checks and submits a paper order only after approval.",
});
