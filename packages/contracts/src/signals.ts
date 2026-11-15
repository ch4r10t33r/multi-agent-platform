import { z } from "zod";
import { TickerSchema } from "./ticker.js";

/**
 * SELL_LONG closes an existing long. SELL_SHORT opens a short.
 * Those are different risk decisions and stay distinct in the contract.
 */
export const SignalActionSchema = z.enum([
  "BUY",
  "SELL_LONG",
  "SELL_SHORT",
  "HOLD",
]);

export type SignalAction = z.infer<typeof SignalActionSchema>;

export const TimeframeSchema = z.enum(["INTRADAY", "SHORT_TERM", "LONG_TERM"]);

export type Timeframe = z.infer<typeof TimeframeSchema>;

export const NewsReferenceSchema = z.object({
  articleId: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  publishedAt: z.iso.datetime(),
});

export type NewsReference = z.infer<typeof NewsReferenceSchema>;

export const PositionSizingSchema = z.object({
  maxNotional: z.number().positive(),
  maxQuantity: z.number().positive(),
});

export type PositionSizing = z.infer<typeof PositionSizingSchema>;

export const TradingSignalSchema = z.object({
  signalId: z.uuid(),
  strategyId: z.string().min(1),
  ticker: TickerSchema,
  action: SignalActionSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  referencePrice: z.number().positive(),
  targetPrice: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  positionSizing: PositionSizingSchema,
  confidence: z.number().min(0).max(1),
  timeframe: TimeframeSchema,
  reasoning: z.string().min(1),
  invalidationConditions: z.array(z.string().min(1)).min(1),
  riskRewardRatio: z.number().positive().optional(),
  modelVersion: z.string().min(1),
  newsReferences: z.array(NewsReferenceSchema),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export type TradingSignal = z.infer<typeof TradingSignalSchema>;

export const SignalRequestSchema = z.object({
  ticker: z.string().min(1),
  approval: z.enum(["auto", "granted", "denied"]).optional(),
});

export type SignalRequest = z.infer<typeof SignalRequestSchema>;
