import { FixtureQuoteProvider } from "@platform/market-data";
import { runIngestionCycle } from "@platform/news-ingestion";
import { buildSignal } from "@platform/research-agent";
import { graph as researchGraph } from "@platform/research-agent";
import { graph as executionGraph } from "@platform/execution-agent";
import {
  approveSignal,
  graph as orchestrator,
  onNewsUpdated,
} from "@platform/supervisor";
import {
  testPlatform,
  testPolicy,
  withPlatform,
  sampleSignal,
} from "./helpers.js";

describe("research and execution", () => {
  it("derives the target from the quote instead of a free-form price", () => {
    const now = new Date();
    const signal = buildSignal({
      ticker: "NVDA",
      articles: [
        {
          articleId: "fixture-nvda-growth",
          canonicalUrl: "https://example.com/news/fixture-nvda-growth",
          title: "NVIDIA shares surge",
          summary: "Bullish growth",
          source: "fixture",
          publishedAt: now.toISOString(),
          fetchedAt: now.toISOString(),
          tickers: ["NVDA"],
        },
      ],
      analysis: {
        sentiment: 1,
        materiality: 1,
        summary: "Positive evidence.",
        modelVersion: "news-momentum-v1:lexicon",
      },
      market: {
        quote: {
          ticker: "NVDA",
          currency: "USD",
          price: 140,
          asOf: now.toISOString(),
          source: "fixture-quotes",
        },
        trend: "up",
        fresh: true,
        historyPoints: 5,
      },
      positionQuantity: 0,
      policy: {
        maxOrderNotional: 5_000,
        minConfidence: 0.55,
        allowShortSales: false,
      },
      now,
    });
    expect(signal.action).toBe("BUY");
    expect(signal.referencePrice).toBe(140);
    expect(signal.targetPrice).toBeGreaterThan(140);
    expect(signal.targetPrice).toBeLessThan(160);
  });

  it("buys NVDA from indexed news and fills at the quote", async () => {
    const platform = testPlatform();
    await runIngestionCycle(platform, ["NVDA"]);
    const result = await orchestrator.invoke(
      { ticker: "NVDA" },
      withPlatform(platform),
    );
    expect(result.signal?.action).toBe("BUY");
    expect(result.signal?.strategyId).toBe("news-momentum-v1");
    expect(result.signal?.referencePrice).toBe(140);
    expect(result.signal?.targetPrice).toBeGreaterThan(140);
    expect(result.order?.status).toBe("FILLED");
    expect(result.order?.fillPrice).toBe(140);
    expect(result.order?.intent).toBe("OPEN_LONG");
    expect(result.executionStatus).toBe("FILLED");
  });

  it("holds TSLA when the news is negative and shorting is disabled", async () => {
    const platform = testPlatform();
    await runIngestionCycle(platform, ["TSLA"]);
    const result = await orchestrator.invoke(
      { ticker: "TSLA" },
      withPlatform(platform),
    );
    expect(result.signal?.action).toBe("HOLD");
    expect(result.order).toBeNull();
    expect(result.executionStatus).toBe("SKIPPED");
  });

  it("does not trade a stale quote", async () => {
    const base = new FixtureQuoteProvider();
    const platform = testPlatform({
      quotes: {
        name: "stale-quotes",
        async getQuote(ticker: string) {
          const current = await base.getQuote(ticker);
          return {
            ...current,
            asOf: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          };
        },
        getHistory: (ticker) => base.getHistory(ticker),
      },
    });
    await runIngestionCycle(platform, ["NVDA"]);
    const result = await orchestrator.invoke(
      { ticker: "NVDA" },
      withPlatform(platform),
    );
    expect(result.signal?.action).toBe("HOLD");
    expect(result.order).toBeNull();
  });

  it("waits for approval above the threshold and then fills the same signal once", async () => {
    const platform = testPlatform({
      policy: testPolicy({ requireHumanApprovalAboveNotional: 100 }),
    });
    await runIngestionCycle(platform, ["NVDA"]);
    const pending = await orchestrator.invoke(
      { ticker: "NVDA" },
      withPlatform(platform),
    );
    expect(pending.executionStatus).toBe("PENDING_APPROVAL");
    expect(pending.order).toBeNull();
    const signalId = pending.signal?.signalId;
    expect(signalId).toBeDefined();
    if (!signalId) return;
    const approved = await approveSignal(
      signalId,
      "granted",
      withPlatform(platform),
    );
    const repeated = await approveSignal(
      signalId,
      "granted",
      withPlatform(platform),
    );
    expect(approved.status).toBe("FILLED");
    expect(repeated.order?.orderId).toBe(approved.order?.orderId);
    expect((await platform.broker.listOrders()).length).toBe(1);
  });

  it("rejects an expired signal before the broker is called", async () => {
    const platform = testPlatform();
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = await executionGraph.invoke(
      {
        signal: sampleSignal({
          createdAt,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
      },
      withPlatform(platform),
    );
    expect(result.status).toBe("INVALID");
    expect(await platform.broker.listOrders()).toEqual([]);
  });

  it("research graph can retrieve the indexed article", async () => {
    const platform = testPlatform();
    await runIngestionCycle(platform, ["NVDA"]);
    const result = await researchGraph.invoke(
      { ticker: "nvda" },
      withPlatform(platform),
    );
    expect(result.articles.map((article) => article.articleId)).toContain(
      "fixture-nvda-growth",
    );
    expect(result.signal?.action).toBe("BUY");
  });
});

describe("event trigger", () => {
  it("lets ingestion publish an event without importing the research graph", async () => {
    const platform = testPlatform();
    const seen: string[] = [];
    onNewsUpdated(platform.events, async (event) => {
      seen.push(event.ticker);
    });
    await runIngestionCycle(platform, ["MSFT"]);
    expect(seen).toEqual(["MSFT"]);
  });
});
