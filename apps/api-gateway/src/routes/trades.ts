import type { FastifyInstance } from "fastify";
import type { Platform } from "@platform/common";

export function registerTradeRoutes(
  app: FastifyInstance,
  platform: Platform,
): void {
  app.get("/trades", async () => platform.ledger.orders.list());
}
