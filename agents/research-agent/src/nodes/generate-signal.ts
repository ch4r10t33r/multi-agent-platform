import { randomUUID } from "node:crypto";
import type {
  NewsArticle,
  SignalAction,
  Timeframe,
  TradingSignal,
} from "@platform/contracts";
import { TradingSignalSchema } from "@platform/contracts";
import {
  addHours,
  assertNever,
  clamp,
  resolvePlatform,
  roundMoney,
} from "@platform/common";
import { STRATEGY } from "../strategy.js";
import type { MarketView, NewsAnalysis, ResearchState } from "../state.js";

export interface SignalPolicy {
  maxOrderNotional: number;
  minConfidence: number;
  allowShortSales: boolean;
}

export interface SignalDraft {
  ticker: string;
  articles: readonly NewsArticle[];
  analysis: NewsAnalysis;
  market: MarketView;
  positionQuantity: number;
  policy: SignalPolicy;
  now: Date;
}

export async function generateSignal(
  state: typeof ResearchState.State,
  config: unknown,
): Promise<typeof ResearchState.Update> {
  if (state.error || !state.analysis || !state.market) return { signal: null };
  const platform = resolvePlatform(config);
  return {
    signal: buildSignal({
      ticker: state.ticker,
      articles: state.articles,
      analysis: state.analysis,
      market: state.market,
      positionQuantity: state.positionQuantity,
      policy: platform.policy,
      now: new Date(),
    }),
  };
}

/** Prices come from the quote and this strategy, never from model text. */
export function buildSignal(draft: SignalDraft): TradingSignal {
  const referencePrice = draft.market.quote.price;
  const confidence = clamp(
    0.45 +
      Math.abs(draft.analysis.sentiment) * 0.4 +
      draft.analysis.materiality * 0.1 +
      (draft.market.fresh ? 0.05 : 0),
    0,
    0.99,
  );
  const directional =
    draft.market.fresh &&
    confidence >=
      Math.max(STRATEGY.confidenceFloor, draft.policy.minConfidence) &&
    draft.analysis.materiality >= STRATEGY.materialityThreshold;
  const bullish =
    directional && draft.analysis.sentiment >= STRATEGY.sentimentThreshold;
  const bearish =
    directional && draft.analysis.sentiment <= -STRATEGY.sentimentThreshold;

  let action: SignalAction = "HOLD";
  if (bullish) action = "BUY";
  else if (bearish && draft.positionQuantity > 0) action = "SELL_LONG";
  else if (
    bearish &&
    draft.policy.allowShortSales &&
    draft.positionQuantity === 0
  ) {
    action = "SELL_SHORT";
  }

  const move = 0.03 + clamp(Math.abs(draft.analysis.sentiment), 0, 1) * 0.02;
  const targetPrice =
    action === "BUY"
      ? roundMoney(referencePrice * (1 + move))
      : action === "SELL_LONG" || action === "SELL_SHORT"
        ? roundMoney(referencePrice * (1 - move))
        : referencePrice;
  const stopLoss =
    action === "BUY"
      ? roundMoney(referencePrice * 0.97)
      : action === "SELL_SHORT"
        ? roundMoney(referencePrice * 1.03)
        : undefined;
  const reward = Math.abs(targetPrice - referencePrice);
  const risk = stopLoss === undefined ? 0 : Math.abs(referencePrice - stopLoss);
  const riskRewardRatio = risk > 0 ? roundMoney(reward / risk) : undefined;

  const newest = draft.articles.reduce<number | null>((latest, article) => {
    const published = Date.parse(article.publishedAt);
    if (Number.isNaN(published)) return latest;
    return latest === null ? published : Math.max(latest, published);
  }, null);
  const newsAge =
    newest === null ? Number.POSITIVE_INFINITY : draft.now.getTime() - newest;
  const timeframe: Timeframe =
    action !== "HOLD" && newsAge <= 12 * 60 * 60 * 1000 && confidence >= 0.75
      ? "INTRADAY"
      : "SHORT_TERM";

  const newsReferences = draft.articles.slice(0, 8).map((article) => ({
    articleId: article.articleId,
    title: article.title,
    url: article.canonicalUrl,
    publishedAt: article.publishedAt,
  }));
  const actionable = action !== "HOLD" && newsReferences.length > 0;
  const finalAction = actionable || action === "HOLD" ? action : "HOLD";

  const createdAt = draft.now.toISOString();
  const signal = {
    signalId: randomUUID(),
    strategyId: STRATEGY.id,
    ticker: draft.ticker,
    action: finalAction,
    currency: draft.market.quote.currency,
    referencePrice,
    targetPrice: finalAction === "HOLD" ? referencePrice : targetPrice,
    stopLoss:
      finalAction === "BUY" || finalAction === "SELL_SHORT"
        ? stopLoss
        : undefined,
    positionSizing: {
      maxNotional: Math.min(
        STRATEGY.maxNotional,
        draft.policy.maxOrderNotional,
      ),
      maxQuantity: STRATEGY.maxQuantity,
    },
    confidence,
    timeframe: finalAction === "HOLD" ? "SHORT_TERM" : timeframe,
    reasoning: reasoning(
      draft,
      finalAction,
      referencePrice,
      finalAction === "HOLD" ? referencePrice : targetPrice,
    ),
    invalidationConditions: invalidation(stopLoss, finalAction),
    riskRewardRatio: finalAction === "HOLD" ? undefined : riskRewardRatio,
    modelVersion: draft.analysis.modelVersion,
    newsReferences,
    createdAt,
    expiresAt: expiryFor(
      finalAction === "HOLD" ? "SHORT_TERM" : timeframe,
      draft.now,
    ),
  };
  return TradingSignalSchema.parse(signal);
}

function reasoning(
  draft: SignalDraft,
  action: SignalAction,
  referencePrice: number,
  targetPrice: number,
): string {
  const history =
    draft.market.trend === "unknown"
      ? "Recent price history was unavailable."
      : `Recent prices are ${draft.market.trend}.`;
  const decision =
    action === "HOLD"
      ? "The evidence does not clear the strategy thresholds, so no order is proposed."
      : `The target price ${targetPrice} is the strategy move from that reference price.`;
  return [
    draft.analysis.summary,
    history,
    `Strategy ${STRATEGY.id} marks ${draft.ticker} ${action} from a ${draft.market.quote.source} reference price of ${referencePrice} ${draft.market.quote.currency}.`,
    decision,
  ].join(" ");
}

function invalidation(
  stopLoss: number | undefined,
  action: SignalAction,
): string[] {
  const conditions = [
    "The signal is invalid after expiresAt.",
    "The live quote deviates more than the risk policy allows from the reference price.",
    "A newer indexed article reverses the sentiment.",
  ];
  if ((action === "BUY" || action === "SELL_SHORT") && stopLoss !== undefined) {
    conditions.push(
      `The thesis is invalid if price trades through ${stopLoss}.`,
    );
  }
  return conditions;
}

function expiryFor(timeframe: Timeframe, now: Date): string {
  switch (timeframe) {
    case "INTRADAY":
      return addHours(now, 4).toISOString();
    case "SHORT_TERM":
      return addHours(now, 24 * 5).toISOString();
    case "LONG_TERM":
      return addHours(now, 24 * 30).toISOString();
    default:
      return assertNever(timeframe);
  }
}
