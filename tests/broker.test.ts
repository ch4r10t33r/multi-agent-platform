import { PaperBroker, reconcileOrders } from "@platform/broker";
import { createMemoryStores } from "@platform/database";
import { sampleSignal } from "./helpers.js";

function requestFromSignal(quantity = 10) {
  const signal = sampleSignal();
  return {
    idempotencyKey: `signal:${signal.signalId}`,
    signalId: signal.signalId,
    ticker: signal.ticker,
    side: "BUY" as const,
    intent: "OPEN_LONG" as const,
    quantity,
    limitPrice: 140,
    currency: "USD",
    paper: true,
  };
}

describe("paper broker", () => {
  it("fills once for an idempotency key and keeps the cash ledger", async () => {
    const stores = createMemoryStores({
      startingCash: 100_000,
      currency: "USD",
    });
    const broker = new PaperBroker(stores.ledger);
    const request = requestFromSignal(10);
    const first = await broker.submitOrder(request);
    const second = await broker.submitOrder(request);
    const portfolio = await broker.getPortfolio();
    expect(second.orderId).toBe(first.orderId);
    expect(first.fillPrice).toBe(140);
    expect(first.status).toBe("FILLED");
    expect(portfolio.cash).toBe(98_600);
    expect(portfolio.positions).toEqual([
      { ticker: "NVDA", quantity: 10, averagePrice: 140 },
    ]);
  });

  it("realizes profit when a long is closed", async () => {
    const stores = createMemoryStores({
      startingCash: 100_000,
      currency: "USD",
    });
    const broker = new PaperBroker(stores.ledger);
    await broker.submitOrder(requestFromSignal(10));
    const signal = sampleSignal();
    await broker.submitOrder({
      idempotencyKey: `close:${signal.signalId}`,
      signalId: signal.signalId,
      ticker: "NVDA",
      side: "SELL",
      intent: "CLOSE_LONG",
      quantity: 10,
      limitPrice: 150,
      currency: "USD",
      paper: true,
    });
    const portfolio = await broker.getPortfolio();
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.cash).toBe(100_100);
    expect(portfolio.realizedPnlToday).toBe(100);
  });

  it("refuses live orders and halted trading", async () => {
    const stores = createMemoryStores({
      startingCash: 100_000,
      currency: "USD",
    });
    const broker = new PaperBroker(stores.ledger);
    await expect(
      broker.submitOrder({ ...requestFromSignal(), paper: false }),
    ).rejects.toThrow(/paper/i);
    broker.halt("broker down");
    await expect(broker.submitOrder(requestFromSignal())).rejects.toThrow(
      /halted|broker down/i,
    );
    expect((await broker.getPortfolio()).cash).toBe(100_000);
  });

  it("reports ledger and broker disagreements", () => {
    const left = {
      ...requestFromSignal(),
      orderId: "8d0b0b7e-3d3e-4f4a-9c1a-6e5d4c3b2a10",
      status: "FILLED" as const,
      fillPrice: 140,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const report = reconcileOrders(
      [left],
      [
        {
          ...left,
          orderId: "1c0b0b7e-3d3e-4f4a-9c1a-6e5d4c3b2a11",
          status: "SUBMITTED",
        },
      ],
    );
    expect(report.ok).toBe(false);
    expect(report.statusMismatches).toEqual([left.orderId]);
  });
});
