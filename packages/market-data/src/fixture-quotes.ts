import type { Quote, QuoteHistory, QuoteProvider } from "@platform/contracts";
import { addHours } from "@platform/common/clock";
import { PlatformError } from "@platform/common/errors";
import { roundMoney } from "@platform/common/money";

const PRICES: Record<string, number> = {
  AAPL: 230,
  NVDA: 140,
  MSFT: 420,
  TSLA: 250,
};

export class FixtureQuoteProvider implements QuoteProvider {
  readonly name = "fixture-quotes";

  constructor(private readonly now: () => Date = () => new Date()) {}

  async getQuote(ticker: string): Promise<Quote> {
    const price = PRICES[ticker];
    if (price === undefined) {
      throw new PlatformError(
        "quote_not_found",
        `No fixture quote for ${ticker}`,
      );
    }
    return {
      ticker,
      currency: "USD",
      price,
      asOf: this.now().toISOString(),
      source: this.name,
    };
  }

  async getHistory(ticker: string): Promise<QuoteHistory> {
    const quote = await this.getQuote(ticker);
    const factors = [0.98, 0.985, 0.99, 0.995, 1];
    return {
      ticker,
      currency: quote.currency,
      points: factors.map((factor, index) => ({
        price: roundMoney(quote.price * factor),
        asOf: addHours(
          this.now(),
          -(factors.length - 1 - index) * 24,
        ).toISOString(),
      })),
    };
  }
}
