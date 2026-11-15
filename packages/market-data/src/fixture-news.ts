import type { FetchedNews, NewsProvider } from "@platform/contracts";
import { addHours } from "@platform/common/clock";

interface FixtureStory {
  articleId: string;
  title: string;
  summary: string;
}

const STORIES: Record<string, FixtureStory> = {
  NVDA: {
    articleId: "fixture-nvda-growth",
    title: "NVIDIA shares surge after record data-center growth",
    summary:
      "Analysts upgrade the stock and cite bullish profit growth in data-center demand.",
  },
  AAPL: {
    articleId: "fixture-aapl-profit",
    title: "Apple reports strong iPhone profit growth",
    summary: "Services profit remains strong after a beat on earnings.",
  },
  MSFT: {
    articleId: "fixture-msft-cloud",
    title: "Microsoft cloud growth remains strong",
    summary: "Azure growth supports a bullish upgrade from analysts.",
  },
  TSLA: {
    articleId: "fixture-tsla-miss",
    title: "Tesla shares fall after a delivery miss",
    summary: "The downgrade cites weak demand and a delivery miss.",
  },
};

export class FixtureNewsProvider implements NewsProvider {
  readonly name = "fixture-news";

  constructor(private readonly now: () => Date = () => new Date()) {}

  async fetchNews(ticker: string): Promise<FetchedNews[]> {
    const story = STORIES[ticker];
    if (!story) return [];
    const publishedAt = addHours(this.now(), -0.5).toISOString();
    return [
      {
        articleId: story.articleId,
        url: `https://example.com/news/${story.articleId}`,
        title: story.title,
        summary: story.summary,
        source: "fixture-news",
        publishedAt,
        tickers: [ticker],
      },
    ];
  }
}
