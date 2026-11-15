import {
  QuoteHistorySchema,
  QuoteSchema,
  type QuoteProvider,
} from "@platform/contracts";
import { errorMessage, PlatformError } from "@platform/common/errors";
import { z } from "zod";

/**
 * Unofficial Yahoo Finance chart endpoint. Disabled unless QUOTE_PROVIDER=yahoo.
 * Failures surface as quote errors. This client does not retry.
 */
const YahooChartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            currency: z.string().optional(),
            regularMarketPrice: z.number().positive(),
            chartPreviousClose: z.number().positive().optional(),
            regularMarketTime: z.number().optional(),
          }),
        }),
      )
      .nullable(),
  }),
});

export class YahooQuoteProvider implements QuoteProvider {
  readonly name = "yahoo-finance-quotes";

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8_000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getQuote(ticker: string) {
    const history = await this.load(ticker);
    const last = history.points[history.points.length - 1];
    if (!last) {
      throw new PlatformError(
        "quote_not_found",
        `Yahoo Finance returned no price for ${ticker}`,
      );
    }
    return QuoteSchema.parse({
      ticker,
      currency: history.currency,
      price: last.price,
      asOf: last.asOf,
      source: this.name,
    });
  }

  async getHistory(ticker: string) {
    return this.load(ticker);
  }

  private async load(ticker: string) {
    const url = new URL(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
    );
    url.searchParams.set("interval", "1d");
    url.searchParams.set("range", "5d");
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
        "quote_provider_failed",
        `Yahoo Finance quote request failed: ${errorMessage(error)}`,
      );
    }
    if (!response.ok) {
      throw new PlatformError(
        "quote_provider_failed",
        `Yahoo Finance quote request failed with status ${response.status}`,
      );
    }
    return parseYahooChart(await response.json(), ticker, this.now());
  }
}

export function parseYahooChart(body: unknown, ticker: string, now: Date) {
  const parsed = YahooChartSchema.safeParse(body);
  const meta = parsed.success ? parsed.data.chart.result?.[0]?.meta : undefined;
  if (!meta) {
    throw new PlatformError(
      "quote_provider_failed",
      `Yahoo Finance returned no quote for ${ticker}`,
    );
  }
  const asOf =
    meta.regularMarketTime === undefined
      ? now.toISOString()
      : new Date(meta.regularMarketTime * 1000).toISOString();
  const previousAsOf = new Date(
    Date.parse(asOf) - 24 * 60 * 60 * 1000,
  ).toISOString();
  const points = [];
  if (meta.chartPreviousClose !== undefined) {
    points.push({ price: meta.chartPreviousClose, asOf: previousAsOf });
  }
  points.push({ price: meta.regularMarketPrice, asOf });
  return QuoteHistorySchema.parse({
    ticker: meta.symbol.toUpperCase(),
    currency: (meta.currency ?? "USD").toUpperCase(),
    points,
  });
}
