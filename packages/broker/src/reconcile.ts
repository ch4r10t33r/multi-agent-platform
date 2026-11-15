import type { OrderRecord } from "@platform/contracts";

export interface ReconciliationReport {
  ok: boolean;
  missingAtBroker: string[];
  missingInLedger: string[];
  statusMismatches: string[];
}

/** Compare the internal ledger with the broker's own order list. */
export function reconcileOrders(
  ledger: readonly OrderRecord[],
  broker: readonly OrderRecord[],
): ReconciliationReport {
  const brokerByKey = new Map(
    broker.map((order) => [order.idempotencyKey, order]),
  );
  const ledgerKeys = new Set(ledger.map((order) => order.idempotencyKey));
  const missingAtBroker: string[] = [];
  const statusMismatches: string[] = [];

  for (const order of ledger) {
    const remote = brokerByKey.get(order.idempotencyKey);
    if (!remote) {
      missingAtBroker.push(order.orderId);
      continue;
    }
    if (
      remote.status !== order.status ||
      remote.quantity !== order.quantity ||
      remote.fillPrice !== order.fillPrice
    ) {
      statusMismatches.push(order.orderId);
    }
  }

  const missingInLedger = broker
    .filter((order) => !ledgerKeys.has(order.idempotencyKey))
    .map((order) => order.orderId);

  return {
    ok:
      missingAtBroker.length === 0 &&
      missingInLedger.length === 0 &&
      statusMismatches.length === 0,
    missingAtBroker,
    missingInLedger,
    statusMismatches,
  };
}
