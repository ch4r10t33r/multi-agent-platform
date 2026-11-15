import { z } from "zod";
import { TickerSchema } from "./ticker.js";

export const QuoteSchema = z.object({
  ticker: TickerSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  price: z.number().positive(),
  asOf: z.iso.datetime(),
  source: z.string().min(1),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const HistoryPointSchema = z.object({
  price: z.number().positive(),
  asOf: z.iso.datetime(),
});

export const QuoteHistorySchema = z.object({
  ticker: TickerSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  points: z.array(HistoryPointSchema),
});

export type QuoteHistory = z.infer<typeof QuoteHistorySchema>;

export interface QuoteProvider {
  readonly name: string;
  getQuote(ticker: string): Promise<Quote>;
  getHistory(ticker: string): Promise<QuoteHistory>;
}
