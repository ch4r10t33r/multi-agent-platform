import { Annotation } from "@langchain/langgraph";
import type {
  Approval,
  ExecutionStatus,
  OrderRecord,
  TradingSignal,
} from "@platform/contracts";

export const OrchestratorState = Annotation.Root({
  ticker: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  approval: Annotation<Approval>({
    reducer: (_left, right) => right,
    default: () => "auto",
  }),
  signal: Annotation<TradingSignal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  order: Annotation<OrderRecord | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  executionStatus: Annotation<ExecutionStatus>({
    reducer: (_left, right) => right,
    default: () => "PENDING",
  }),
  reasons: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});
