import { runIngestionCycle } from "@platform/news-ingestion";
import { graph, onNewsUpdated } from "@platform/supervisor";
import { testPlatform, withPlatform } from "./helpers.js";

describe("event-driven paper trade", () => {
  it("turns a new NVDA article into one paper buy and leaves TSLA unfilled", async () => {
    const platform = testPlatform();
    const results = new Map<string, Awaited<ReturnType<typeof graph.invoke>>>();
    onNewsUpdated(platform.events, async (event) => {
      results.set(
        event.ticker,
        await graph.invoke({ ticker: event.ticker }, withPlatform(platform)),
      );
    });
    await runIngestionCycle(platform, ["NVDA", "TSLA"]);
    expect(results.get("NVDA")?.order?.status).toBe("FILLED");
    expect(results.get("NVDA")?.order?.fillPrice).toBe(140);
    expect(results.get("TSLA")?.signal?.action).toBe("HOLD");
    expect(results.get("TSLA")?.order).toBeNull();
    expect(
      (await platform.broker.listOrders()).map((order) => order.ticker),
    ).toEqual(["NVDA"]);
  });
});
