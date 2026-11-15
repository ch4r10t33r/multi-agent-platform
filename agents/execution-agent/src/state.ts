import { Annotation } from "@langchain/langgraph";
import type {
  Approval,
  ExecutionStatus,
  OrderRecord,
  TradingSignal,
} from "@platform/contracts";
import type { RiskDecision } from "@platform/risk";

export const ExecutionState = Annotation.Root({
  signal: Annotation<TradingSignal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  approval: Annotation<Approval>({
    reducer: (_left, right) => right,
    default: () => "auto",
  }),
  decision: Annotation<RiskDecision | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  status: Annotation<ExecutionStatus>({
    reducer: (_left, right) => right,
    default: () => "PENDING",
  }),
  order: Annotation<OrderRecord | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  reasons: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});
