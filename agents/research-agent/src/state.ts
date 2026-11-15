import { Annotation } from "@langchain/langgraph";
import type { NewsArticle, Quote, TradingSignal } from "@platform/contracts";

export interface NewsAnalysis {
  sentiment: number;
  materiality: number;
  summary: string;
  modelVersion: string;
}

export type PriceTrend = "up" | "down" | "flat" | "unknown";

export interface MarketView {
  quote: Quote;
  trend: PriceTrend;
  fresh: boolean;
  historyPoints: number;
}

export const ResearchState = Annotation.Root({
  ticker: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  positionQuantity: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  articles: Annotation<NewsArticle[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  analysis: Annotation<NewsAnalysis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  market: Annotation<MarketView | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  signal: Annotation<TradingSignal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});
