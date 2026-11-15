import type { FetchedNews, NewsProvider } from "@platform/contracts";
import { errorMessage, PlatformError } from "@platform/common/errors";
import { z } from "zod";

/**
 * Unofficial Yahoo Finance search endpoint.
 * Yahoo does not document a general-purpose public news API. Review Yahoo's
 * terms, rate limits, and retention rules before enabling this provider.
 * The default provider is the local fixture feed.
 */
const SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";

const YahooNewsSchema = z.object({
  news: z
    .array(
      z.object({
        uuid: z.string().optional(),
        title: z.string(),
        link: z.string(),
        publisher: z.string().optional(),
        providerPublishTime: z.number().optional(),
        summary: z.string().optional(),
        relatedTickers: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export class YahooNewsProvider implements NewsProvider {
  readonly name = "yahoo-finance-news";

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8_000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fetchNews(ticker: string): Promise<FetchedNews[]> {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", ticker);
    url.searchParams.set("newsCount", "20");
    url.searchParams.set("quotesCount", "0");
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          accept: "application/json",
          "user-agent": "multi-agent-platform/0.1",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PlatformError(
        "news_provider_failed",
        `Yahoo Finance news request failed: ${errorMessage(error)}`,
      );
    }
    if (!response.ok) {
      throw new PlatformError(
        "news_provider_failed",
        `Yahoo Finance news request failed with status ${response.status}`,
      );
    }
    return parseYahooNews(await response.json(), ticker, this.now());
  }
}

export function parseYahooNews(
  body: unknown,
  ticker: string,
  now: Date,
): FetchedNews[] {
  const parsed = YahooNewsSchema.safeParse(body);
  if (!parsed.success) {
    throw new PlatformError(
      "news_provider_failed",
      "Yahoo Finance news response did not match the expected shape",
    );
  }
  const articles: FetchedNews[] = [];
  for (const item of parsed.data.news ?? []) {
    let publishedAt = now.toISOString();
    if (item.providerPublishTime !== undefined) {
      const timestamp = new Date(item.providerPublishTime * 1000);
      if (Number.isNaN(timestamp.getTime())) continue;
      publishedAt = timestamp.toISOString();
    }
    const related = (item.relatedTickers ?? [ticker]).map((value) =>
      value.toUpperCase(),
    );
    if (!related.includes(ticker)) related.push(ticker);
    articles.push({
      articleId: item.uuid,
      url: item.link,
      title: item.title,
      summary: item.summary,
      source: item.publisher ?? "yahoo-finance",
      publishedAt,
      tickers: related,
    });
  }
  return articles;
}
