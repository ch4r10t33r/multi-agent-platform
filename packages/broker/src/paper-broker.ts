import { randomUUID } from "node:crypto";
import {
  OrderRecordSchema,
  OrderRequestSchema,
  type OrderIntent,
  type OrderRecord,
  type OrderRequest,
  type OrderSide,
  type Portfolio,
} from "@platform/contracts";
import type { TradingLedger } from "@platform/database";
import { nowIso } from "@platform/common/clock";
import {
  assertNever,
  formatIssues,
  PlatformError,
} from "@platform/common/errors";
import { roundMoney } from "@platform/common/money";

export interface BrokerHealth {
  ok: boolean;
  reason?: string;
}

export interface Broker {
  readonly mode: "paper";
  health(): Promise<BrokerHealth>;
  halt(reason: string): void;
  resume(): void;
  submitOrder(request: OrderRequest): Promise<OrderRecord>;
  listOrders(): Promise<OrderRecord[]>;
  getPortfolio(): Promise<Portfolio>;
}

export class PaperBroker implements Broker {
  readonly mode = "paper" as const;
  private halted = false;
  private haltReason: string | undefined;

  constructor(private readonly ledger: TradingLedger) {}

  halt(reason: string): void {
    this.halted = true;
    this.haltReason = reason;
  }

  resume(): void {
    this.halted = false;
    this.haltReason = undefined;
  }

  async health(): Promise<BrokerHealth> {
    if (this.halted) return { ok: false, reason: this.haltReason };
    return { ok: true };
  }

  async submitOrder(request: OrderRequest): Promise<OrderRecord> {
    const parsed = OrderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new PlatformError(
        "invalid_order",
        formatIssues(parsed.error.issues),
      );
    }
    const orderRequest = parsed.data;
    if (orderRequest.paper !== true) {
      throw new PlatformError(
        "live_trading_disabled",
        "The paper broker refuses live orders",
      );
    }
    if (expectedSide(orderRequest.intent) !== orderRequest.side) {
      throw new PlatformError(
        "invalid_order",
        "Order side does not match its intent",
      );
    }

    return this.ledger.transaction(async (stores) => {
      const existing = await stores.orders.getByIdempotencyKey(
        orderRequest.idempotencyKey,
      );
      if (existing) return existing;
      if (this.halted) {
        throw new PlatformError(
          "circuit_open",
          this.haltReason ?? "Trading is halted",
        );
      }
      const portfolio = await stores.portfolio.get();
      const next = applyFill(portfolio, orderRequest);
      const timestamp = nowIso();
      const order = OrderRecordSchema.parse({
        ...orderRequest,
        orderId: randomUUID(),
        status: "FILLED",
        fillPrice: orderRequest.limitPrice,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await stores.orders.save(order);
      await stores.portfolio.save(next);
      return order;
    });
  }

  async listOrders(): Promise<OrderRecord[]> {
    return this.ledger.orders.list();
  }

  async getPortfolio(): Promise<Portfolio> {
    return this.ledger.portfolio.get();
  }
}

export function expectedSide(intent: OrderIntent): OrderSide {
  switch (intent) {
    case "OPEN_LONG":
      return "BUY";
    case "CLOSE_LONG":
    case "OPEN_SHORT":
      return "SELL";
    default:
      return assertNever(intent);
  }
}

export function applyFill(
  portfolio: Portfolio,
  request: OrderRequest,
): Portfolio {
  if (request.currency !== portfolio.currency) {
    throw new PlatformError(
      "currency_mismatch",
      "Order currency does not match the portfolio",
    );
  }
  const price = request.limitPrice;
  const cost = roundMoney(request.quantity * price);
  const positions = portfolio.positions.map((position) => ({ ...position }));
  const current = positions.find(
    (position) => position.ticker === request.ticker,
  );

  switch (request.intent) {
    case "OPEN_LONG": {
      if (current && current.quantity < 0) {
        throw new PlatformError(
          "position_conflict",
          "Cannot open a long while a short is open",
        );
      }
      if (portfolio.cash < cost) {
        throw new PlatformError(
          "insufficient_funds",
          "Insufficient cash for the paper order",
        );
      }
      const quantity = current?.quantity ?? 0;
      const averagePrice = current?.averagePrice ?? price;
      const nextQuantity = quantity + request.quantity;
      return {
        ...portfolio,
        cash: roundMoney(portfolio.cash - cost),
        positions: upsertPosition(positions, {
          ticker: request.ticker,
          quantity: nextQuantity,
          averagePrice: roundMoney(
            (quantity * averagePrice + request.quantity * price) / nextQuantity,
          ),
        }),
      };
    }
    case "CLOSE_LONG": {
      if (!current || current.quantity < request.quantity) {
        throw new PlatformError(
          "insufficient_position",
          "No long position covers this sell",
        );
      }
      const nextQuantity = current.quantity - request.quantity;
      const realized = roundMoney(
        (price - current.averagePrice) * request.quantity,
      );
      const nextPositions =
        nextQuantity === 0
          ? positions.filter((position) => position.ticker !== request.ticker)
          : upsertPosition(positions, { ...current, quantity: nextQuantity });
      return {
        ...portfolio,
        cash: roundMoney(portfolio.cash + cost),
        realizedPnlToday: roundMoney(portfolio.realizedPnlToday + realized),
        positions: nextPositions,
      };
    }
    case "OPEN_SHORT": {
      if (current && current.quantity !== 0) {
        throw new PlatformError(
          "position_conflict",
          "Short sales require a flat position",
        );
      }
      return {
        ...portfolio,
        cash: roundMoney(portfolio.cash + cost),
        positions: upsertPosition(positions, {
          ticker: request.ticker,
          quantity: -request.quantity,
          averagePrice: price,
        }),
      };
    }
    default:
      return assertNever(request.intent);
  }
}

function upsertPosition(
  positions: Portfolio["positions"],
  position: Portfolio["positions"][number],
): Portfolio["positions"] {
  const index = positions.findIndex((item) => item.ticker === position.ticker);
  if (index < 0) return [...positions, position];
  const next = [...positions];
  next[index] = position;
  return next;
}
