import type { NewsProvider, QuoteProvider } from "@platform/contracts";
import { assertNever } from "@platform/common/errors";
import type { AppEnv } from "@platform/common/env";
import { FixtureNewsProvider } from "./fixture-news.js";
import { FixtureQuoteProvider } from "./fixture-quotes.js";
import { YahooNewsProvider } from "./yahoo-news.js";
import { YahooQuoteProvider } from "./yahoo-quotes.js";

export function createNewsProvider(env: AppEnv): NewsProvider {
  switch (env.newsProvider) {
    case "fixture":
      return new FixtureNewsProvider();
    case "yahoo":
      return new YahooNewsProvider();
    default:
      return assertNever(env.newsProvider);
  }
}

export function createQuoteProvider(env: AppEnv): QuoteProvider {
  switch (env.quoteProvider) {
    case "fixture":
      return new FixtureQuoteProvider();
    case "yahoo":
      return new YahooQuoteProvider();
    default:
      return assertNever(env.quoteProvider);
  }
}

export { FixtureNewsProvider } from "./fixture-news.js";
export { FixtureQuoteProvider } from "./fixture-quotes.js";
export { parseYahooNews, YahooNewsProvider } from "./yahoo-news.js";
export { parseYahooChart, YahooQuoteProvider } from "./yahoo-quotes.js";
