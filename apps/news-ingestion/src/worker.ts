import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Worker } from "bullmq";
import { IngestionJobSchema } from "@platform/contracts";
import {
  connectPlatform,
  errorMessage,
  loadTickers,
  normalizeTicker,
  nowIso,
  setPlatform,
  type Platform,
} from "@platform/common";
import { redisConnection } from "@platform/common/env";
import { indexNews } from "@platform/vector-store";
import { deduplicate } from "./deduplicator.js";
import { embedArticles } from "./embedder.js";
import { fetchNews } from "./fetcher.js";
import { normalizeArticle } from "./normalizer.js";
import {
  createNewsQueue,
  NEWS_QUEUE_NAME,
  registerNewsSchedule,
} from "./scheduler.js";

export interface IngestionResult {
  tickers: string[];
  fetched: number;
  inserted: number;
  articleIds: string[];
}

export async function runIngestionCycle(
  platform: Platform,
  tickers: readonly string[],
): Promise<IngestionResult> {
  const normalizedTickers = tickers.map((ticker) => normalizeTicker(ticker));
  const runId = randomUUID();
  await platform.ingestionRuns.start({
    runId,
    tickers: normalizedTickers,
    startedAt: nowIso(),
  });
  try {
    const result = await ingest(platform, normalizedTickers);
    await platform.ingestionRuns.finish(runId, {
      finishedAt: nowIso(),
      insertedCount: result.inserted,
      status: "completed",
    });
    platform.logger.info("ingestion.completed", {
      inserted: result.inserted,
      fetched: result.fetched,
    });
    return result;
  } catch (error) {
    await platform.ingestionRuns.finish(runId, {
      finishedAt: nowIso(),
      insertedCount: 0,
      status: "failed",
    });
    platform.logger.error("ingestion.failed", { message: errorMessage(error) });
    throw error;
  }
}

async function ingest(
  platform: Platform,
  tickers: readonly string[],
): Promise<IngestionResult> {
  const fetchedArticles = await fetchNews(platform.news, tickers);
  const normalized = fetchedArticles.flatMap((article) => {
    const item = normalizeArticle(article, new Date());
    return item ? [item] : [];
  });
  const pending = await deduplicate(
    normalized,
    platform.articles,
    platform.vectors,
    platform.embedder.model,
  );
  const inserted = await platform.articles.upsertMany(pending);
  const embedded = await embedArticles(platform.embedder, pending);
  await indexNews(platform.vectors, embedded);

  const byTicker = new Map<string, string[]>();
  for (const article of pending) {
    for (const ticker of article.tickers) {
      if (!tickers.includes(ticker)) continue;
      const ids = byTicker.get(ticker) ?? [];
      ids.push(article.articleId);
      byTicker.set(ticker, ids);
    }
  }
  for (const [ticker, articleIds] of byTicker) {
    await platform.events.publish({
      type: "news.updated",
      ticker,
      articleIds,
      occurredAt: nowIso(),
    });
  }

  return {
    tickers: [...tickers],
    fetched: fetchedArticles.length,
    inserted: inserted.length,
    articleIds: pending.map((article) => article.articleId),
  };
}

export function startNewsWorker(platform: Platform): Worker {
  return new Worker(
    NEWS_QUEUE_NAME,
    async (job) => {
      const data = IngestionJobSchema.parse(job.data);
      return runIngestionCycle(platform, data.tickers);
    },
    { connection: redisConnection(platform.env) },
  );
}

async function main(): Promise<void> {
  const platform = await connectPlatform();
  setPlatform(platform);
  if (process.argv.includes("--once")) {
    await runIngestionCycle(platform, loadTickers());
    await platform.close();
    return;
  }
  const queue = createNewsQueue(platform.env);
  await registerNewsSchedule(queue, loadTickers());
  const worker = startNewsWorker(platform);
  platform.logger.info("ingestion.worker.started", { queue: NEWS_QUEUE_NAME });
  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await platform.close();
  };
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
