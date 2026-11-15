import "dotenv/config";
import { createPlatform, setPlatform } from "@platform/common";
import { runIngestionCycle } from "@platform/news-ingestion";
import { graph, onNewsUpdated } from "@platform/supervisor";

const platform = createPlatform();
setPlatform(platform);

const results = new Map<string, Awaited<ReturnType<typeof graph.invoke>>>();
onNewsUpdated(platform.events, async (event) => {
  results.set(
    event.ticker,
    await graph.invoke(
      { ticker: event.ticker },
      { configurable: { platform } },
    ),
  );
});

await runIngestionCycle(platform, ["NVDA", "TSLA"]);

function summarize(
  result: Awaited<ReturnType<typeof graph.invoke>> | undefined,
) {
  return {
    action: result?.signal?.action ?? null,
    modelVersion: result?.signal?.modelVersion ?? null,
    referencePrice: result?.signal?.referencePrice ?? null,
    targetPrice: result?.signal?.targetPrice ?? null,
    executionStatus: result?.executionStatus ?? null,
    orderStatus: result?.order?.status ?? null,
    fillPrice: result?.order?.fillPrice ?? null,
    reasons: result?.reasons ?? [],
  };
}

console.log(
  JSON.stringify(
    {
      nvda: summarize(results.get("NVDA")),
      tsla: summarize(results.get("TSLA")),
    },
    null,
    2,
  ),
);

await platform.close();
