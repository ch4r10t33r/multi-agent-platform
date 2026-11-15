import type { FetchedNews, NewsProvider } from "@platform/contracts";

export async function fetchNews(
  provider: NewsProvider,
  tickers: readonly string[],
): Promise<FetchedNews[]> {
  const articles: FetchedNews[] = [];
  for (const ticker of tickers) {
    const batch = await provider.fetchNews(ticker);
    articles.push(...batch);
  }
  return articles;
}
