import { randomUUID } from "node:crypto";
import {
  TradingSignalSchema,
  type Portfolio,
  type Quote,
  type TradingSignal,
} from "@platform/contracts";
import { createPlatform, readEnv, type Platform } from "@platform/common";
import { loadRiskPolicy, type RiskPolicy } from "@platform/risk";

export function testPlatform(options?: {
  policy?: RiskPolicy;
  quotes?: Platform["quotes"];
  news?: Platform["news"];
}): Platform {
  return createPlatform({
    env: readEnv({
      LOG_LEVEL: "error",
      NEWS_PROVIDER: "fixture",
      QUOTE_PROVIDER: "fixture",
    }),
    ...options,
  });
}

export function withPlatform(platform: Platform) {
  return { configurable: { platform } };
}

export function cashPortfolio(cash = 100_000): Portfolio {
  return { cash, currency: "USD", realizedPnlToday: 0, positions: [] };
}

export function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    ticker: "NVDA",
    currency: "USD",
    price: 140,
    asOf: new Date().toISOString(),
    source: "test",
    ...overrides,
  };
}

export function sampleSignal(
  overrides: Partial<TradingSignal> = {},
): TradingSignal {
  const now = new Date();
  return TradingSignalSchema.parse({
    signalId: randomUUID(),
    strategyId: "news-momentum-v1",
    ticker: "NVDA",
    action: "BUY",
    currency: "USD",
    referencePrice: 140,
    targetPrice: 147,
    stopLoss: 135.8,
    positionSizing: { maxNotional: 2_000, maxQuantity: 20 },
    confidence: 0.8,
    timeframe: "SHORT_TERM",
    reasoning: "Strategy news-momentum-v1 uses the reference price.",
    invalidationConditions: ["The signal is invalid after expiresAt."],
    riskRewardRatio: 1.67,
    modelVersion: "test",
    newsReferences: [
      {
        articleId: "fixture-nvda-growth",
        title: "NVIDIA shares surge after record data-center growth",
        url: "https://example.com/news/fixture-nvda-growth",
        publishedAt: now.toISOString(),
      },
    ],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  });
}

export function testPolicy(overrides: Partial<RiskPolicy> = {}): RiskPolicy {
  return { ...loadRiskPolicy(), ...overrides };
}
