import type { QuoteHistory } from "@platform/contracts";
import { errorMessage, parseTime, resolvePlatform } from "@platform/common";
import type { PriceTrend, ResearchState } from "../state.js";

export async function analyseMarket(
  state: typeof ResearchState.State,
  config: unknown,
): Promise<typeof ResearchState.Update> {
  if (state.error) return {};
  const platform = resolvePlatform(config);
  try {
    const quote = await platform.quotes.getQuote(state.ticker);
    const history = await platform.quotes.getHistory(state.ticker);
    const ageMs = Date.now() - parseTime(quote.asOf);
    const fresh =
      ageMs <= platform.policy.maxMarketDataAgeMs && ageMs >= -60_000;
    return {
      market: {
        quote,
        trend: trendOf(history),
        fresh,
        historyPoints: history.points.length,
      },
    };
  } catch (error) {
    return { market: null, error: errorMessage(error) };
  }
}

function trendOf(history: QuoteHistory): PriceTrend {
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  if (!first || !last || first.price === 0) return "unknown";
  const change = (last.price - first.price) / first.price;
  if (change > 0.005) return "up";
  if (change < -0.005) return "down";
  return "flat";
}
