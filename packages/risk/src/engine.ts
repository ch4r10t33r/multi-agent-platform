import type {
  Portfolio,
  Quote,
  SignalAction,
  TradingSignal,
} from "@platform/contracts";
import { assertNever } from "@platform/common/errors";
import { parseTime } from "@platform/common/clock";
import { roundMoney } from "@platform/common/money";
import type { RiskPolicy } from "./policy.js";

export type RiskDecision =
  | {
      status: "approved";
      quantity: number;
      notional: number;
      requiresHumanApproval: boolean;
      reasons: string[];
    }
  | { status: "rejected"; reasons: string[] }
  | { status: "skipped"; reasons: string[] };

export interface RiskInput {
  signal: TradingSignal;
  quote: Quote;
  portfolio: Portfolio;
  policy: RiskPolicy;
  now: Date;
  brokerHealthy: boolean;
  liveRequested: boolean;
}

/**
 * Deterministic risk gate. Agents can propose a signal, but they cannot
 * change the outcome of this function.
 */
export function assessRisk(input: RiskInput): RiskDecision {
  const reasons: string[] = [];
  const { signal, quote, portfolio, policy, now } = input;

  if (!input.brokerHealthy) {
    reasons.push("Circuit breaker open: broker is unavailable");
  }
  if (policy.paperTradingOnly && input.liveRequested) {
    reasons.push("Live trading is disabled");
  }
  if (portfolio.realizedPnlToday <= -policy.maxDailyLoss) {
    reasons.push("Circuit breaker open: daily loss limit reached");
  }
  if (!policy.allowedTickers.includes(signal.ticker)) {
    reasons.push(`Ticker ${signal.ticker} is outside the allowed universe`);
  }
  if (signal.ticker !== quote.ticker) {
    reasons.push("Quote ticker does not match the signal");
  }
  if (
    signal.currency !== quote.currency ||
    signal.currency !== portfolio.currency
  ) {
    reasons.push("Signal, quote, and portfolio currencies must match");
  }

  const createdAt = parseTime(signal.createdAt);
  const expiresAt = parseTime(signal.expiresAt);
  const quotedAt = parseTime(quote.asOf);
  if (expiresAt <= createdAt) {
    reasons.push("Signal expiry is not after its creation time");
  }
  if (now.getTime() >= expiresAt) {
    reasons.push("Signal has expired");
  }
  if (now.getTime() - createdAt > policy.maxSignalAgeMs) {
    reasons.push("Signal is older than the maximum execution age");
  }
  if (quotedAt > now.getTime() + 60_000) {
    reasons.push("Market data timestamp is in the future");
  }
  if (now.getTime() - quotedAt > policy.maxMarketDataAgeMs) {
    reasons.push("Market data is stale");
  }

  const deviation = Math.abs(quote.price - signal.referencePrice) / quote.price;
  if (deviation > policy.priceDeviationTolerance) {
    reasons.push("Reference price is not supported by the current quote");
  }

  if (signal.action !== "HOLD" && signal.newsReferences.length === 0) {
    reasons.push("Actionable signals require source attribution");
  }
  if (signal.action !== "HOLD" && signal.confidence < policy.minConfidence) {
    reasons.push("Signal confidence is below the policy minimum");
  }

  if (reasons.length > 0) return { status: "rejected", reasons };

  switch (signal.action) {
    case "HOLD":
      return { status: "skipped", reasons: ["HOLD is not an order"] };
    case "BUY":
      return sizeEntry(input, "BUY");
    case "SELL_LONG":
      return sizeSellLong(input);
    case "SELL_SHORT":
      return sizeShort(input);
    default:
      return assertNever(signal.action);
  }
}

function sizeEntry(
  input: RiskInput,
  action: Extract<SignalAction, "BUY" | "SELL_SHORT">,
): RiskDecision {
  const { signal, quote, portfolio, policy } = input;
  const current = positionQuantity(portfolio, signal.ticker);
  if (action === "SELL_SHORT" && current !== 0) {
    return {
      status: "rejected",
      reasons: ["Short sales require a flat position"],
    };
  }
  if (action === "BUY" && current < 0) {
    return {
      status: "rejected",
      reasons: ["Cannot open a long while a short is open"],
    };
  }

  const price = quote.price;
  const currentNotional = Math.abs(current) * price;
  const portfolioNotional = exposure(portfolio, quote);
  const roomPosition = policy.maxPositionNotional - Math.abs(currentNotional);
  const roomPortfolio = policy.maxPortfolioNotional - portfolioNotional;
  const strategyNotional = signal.positionSizing.maxNotional;
  const notionalCap = Math.min(
    policy.maxOrderNotional,
    strategyNotional,
    roomPosition,
    roomPortfolio,
    action === "BUY" ? portfolio.cash : Number.POSITIVE_INFINITY,
  );
  const quantity = Math.min(
    signal.positionSizing.maxQuantity,
    Math.floor(notionalCap / price),
  );
  if (quantity < 1) {
    return {
      status: "rejected",
      reasons: ["Position size is below one share after risk limits"],
    };
  }
  return approved(quantity, price, policy, action);
}

function sizeSellLong(input: RiskInput): RiskDecision {
  const { signal, quote, portfolio, policy } = input;
  const current = positionQuantity(portfolio, signal.ticker);
  if (current < 1) {
    return { status: "rejected", reasons: ["No long position to sell"] };
  }
  const requested = signal.quantity ?? current;
  const quantity = Math.min(
    signal.positionSizing.maxQuantity,
    Math.floor(requested),
    current,
  );
  if (quantity < 1) {
    return {
      status: "rejected",
      reasons: ["Sell quantity is below one share"],
    };
  }
  return approved(quantity, quote.price, policy, "SELL_LONG");
}

function sizeShort(input: RiskInput): RiskDecision {
  if (!input.policy.allowShortSales) {
    return {
      status: "rejected",
      reasons: ["Opening a short is disabled by the risk policy"],
    };
  }
  return sizeEntry(input, "SELL_SHORT");
}

function approved(
  quantity: number,
  price: number,
  policy: RiskPolicy,
  action: SignalAction,
): RiskDecision {
  const notional = roundMoney(quantity * price);
  const requiresHumanApproval =
    notional > policy.requireHumanApprovalAboveNotional;
  return {
    status: "approved",
    quantity,
    notional,
    requiresHumanApproval,
    reasons: [
      `Sized ${quantity} shares for ${action} within deterministic risk limits`,
    ],
  };
}

function positionQuantity(portfolio: Portfolio, ticker: string): number {
  return (
    portfolio.positions.find((position) => position.ticker === ticker)
      ?.quantity ?? 0
  );
}

function exposure(portfolio: Portfolio, quote: Quote): number {
  return portfolio.positions.reduce((sum, position) => {
    const mark =
      position.ticker === quote.ticker ? quote.price : position.averagePrice;
    return sum + Math.abs(position.quantity) * mark;
  }, 0);
}
