import type {
  OrderIntent,
  OrderRequest,
  SignalAction,
} from "@platform/contracts";
import {
  assertNever,
  errorMessage,
  nowIso,
  resolvePlatform,
} from "@platform/common";
import { expectedSide } from "@platform/broker";
import { recordExecution } from "../audit.js";
import type { ExecutionState } from "../state.js";

export async function submitOrder(
  state: typeof ExecutionState.State,
  config: unknown,
): Promise<typeof ExecutionState.Update> {
  const platform = resolvePlatform(config);
  if (
    state.status !== "APPROVED" ||
    !state.signal ||
    state.decision?.status !== "approved"
  ) {
    return recordExecution(
      platform,
      "FAILED",
      ["Refusing to submit an order that is not approved"],
      state.signal?.signalId ?? null,
    );
  }
  const intent = intentFor(state.signal.action);
  if (!intent) {
    return recordExecution(
      platform,
      "SKIPPED",
      ["HOLD signals are not orders"],
      state.signal.signalId,
    );
  }
  try {
    const quote = await platform.quotes.getQuote(state.signal.ticker);
    const request: OrderRequest = {
      idempotencyKey: `signal:${state.signal.signalId}`,
      signalId: state.signal.signalId,
      ticker: state.signal.ticker,
      side: expectedSide(intent),
      intent,
      quantity: state.decision.quantity,
      limitPrice: quote.price,
      currency: quote.currency,
      paper: true,
    };
    const order = await platform.broker.submitOrder(request);
    await platform.audit.record({
      type: "order.submitted",
      occurredAt: order.updatedAt,
      attributes: {
        orderId: order.orderId,
        signalId: order.signalId,
        ticker: order.ticker,
        status: order.status,
        quantity: order.quantity,
        fillPrice: order.fillPrice ?? null,
      },
    });
    await platform.events.publish({
      type: "order.submitted",
      orderId: order.orderId,
      signalId: order.signalId,
      occurredAt: nowIso(),
    });
    return {
      order,
      status: "FILLED",
      reasons: ["Paper order filled at the live quote"],
    };
  } catch (error) {
    return recordExecution(
      platform,
      "FAILED",
      [errorMessage(error)],
      state.signal.signalId,
    );
  }
}

function intentFor(action: SignalAction): OrderIntent | null {
  switch (action) {
    case "BUY":
      return "OPEN_LONG";
    case "SELL_LONG":
      return "CLOSE_LONG";
    case "SELL_SHORT":
      return "OPEN_SHORT";
    case "HOLD":
      return null;
    default:
      return assertNever(action);
  }
}
