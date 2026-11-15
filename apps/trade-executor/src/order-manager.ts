import type { OrderRecord, OrderRequest } from "@platform/contracts";
import type { Broker } from "@platform/broker";
import type { AuditLog } from "@platform/database";

export async function submitApprovedOrder(
  broker: Broker,
  request: OrderRequest,
  audit: AuditLog,
): Promise<OrderRecord> {
  const order = await broker.submitOrder(request);
  await audit.record({
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
  return order;
}
