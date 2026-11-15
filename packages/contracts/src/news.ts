import { z } from "zod";
import { TickerSchema } from "./ticker.js";

export const NewsArticleSchema = z.object({
  articleId: z.string().min(1),
  canonicalUrl: z.url(),
  title: z.string().min(1),
  summary: z.string(),
  source: z.string().min(1),
  publishedAt: z.iso.datetime(),
  fetchedAt: z.iso.datetime(),
  tickers: z.array(TickerSchema).min(1),
});

export type NewsArticle = z.infer<typeof NewsArticleSchema>;

/** Provider payload before canonicalisation. Providers must not write storage. */
export interface FetchedNews {
  articleId?: string;
  url: string;
  title: string;
  summary?: string;
  source: string;
  publishedAt: string;
  tickers: string[];
}

export interface NewsProvider {
  readonly name: string;
  fetchNews(ticker: string): Promise<FetchedNews[]>;
}

export const IngestionJobSchema = z.object({
  tickers: z.array(TickerSchema).min(1),
});

export type IngestionJob = z.infer<typeof IngestionJobSchema>;
