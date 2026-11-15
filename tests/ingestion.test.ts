import { readFileSync } from "node:fs";
import { EMBEDDING_DIMENSIONS } from "@platform/common/constants";
import { parseYahooChart, parseYahooNews } from "@platform/market-data";
import { runIngestionCycle } from "@platform/news-ingestion";
import { canonicalizeUrl, normalizeArticle } from "@platform/news-ingestion";
import { testPlatform } from "./helpers.js";

describe("news ingestion", () => {
  it("canonicalises tracking parameters", () => {
    const article = normalizeArticle(
      {
        url: "https://Example.com/news/nvidia/?utm_source=rss&utm_medium=email",
        title: "NVIDIA shares surge",
        summary: "Growth remains strong",
        source: "fixture",
        publishedAt: new Date().toISOString(),
        tickers: ["nvda"],
      },
      new Date(),
    );
    expect(article?.canonicalUrl).toBe("https://example.com/news/nvidia");
    expect(canonicalizeUrl("https://example.com/a/?utm_campaign=x")).toBe(
      "https://example.com/a",
    );
  });

  it("stores a fixture article once and emits news.updated", async () => {
    const platform = testPlatform();
    const events: string[] = [];
    const unsubscribe = platform.events.subscribe(
      "news.updated",
      async (event) => {
        events.push(event.ticker);
      },
    );
    const first = await runIngestionCycle(platform, ["NVDA"]);
    const second = await runIngestionCycle(platform, ["NVDA"]);
    unsubscribe();
    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(events).toEqual(["NVDA"]);
    const found = await platform.vectors.has(
      "fixture-nvda-growth",
      platform.embedder.model,
    );
    expect(found).toBe(true);
  });

  it("parses the unofficial Yahoo payloads without calling the network", () => {
    const news = parseYahooNews(
      {
        news: [
          {
            uuid: "abc",
            title: "NVIDIA rises",
            link: "https://finance.yahoo.com/news/nvidia",
            publisher: "Reuters",
            providerPublishTime: 1_763_200_000,
            relatedTickers: ["NVDA"],
          },
        ],
      },
      "NVDA",
      new Date(),
    );
    expect(news[0]?.articleId).toBe("abc");
    expect(news[0]?.tickers).toContain("NVDA");

    const history = parseYahooChart(
      {
        chart: {
          result: [
            {
              meta: {
                symbol: "NVDA",
                currency: "USD",
                regularMarketPrice: 140.5,
                chartPreviousClose: 136,
                regularMarketTime: 1_763_200_000,
              },
            },
          ],
        },
      },
      "NVDA",
      new Date(),
    );
    expect(history.points).toHaveLength(2);
    expect(history.points[1]?.price).toBe(140.5);
  });

  it("keeps the vector column and the embedder on the same width", () => {
    const sql = readFileSync("infrastructure/migrations/001_init.sql", "utf8");
    expect(sql).toContain(`vector(${EMBEDDING_DIMENSIONS})`);
    expect(sql).toContain("trading.orders");
    expect(sql).toContain("schema langgraph");
  });
});
