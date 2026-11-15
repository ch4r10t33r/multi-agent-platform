import { Queue } from "bullmq";
import { IngestionJobSchema, type IngestionJob } from "@platform/contracts";
import type { AppEnv } from "@platform/common/env";
import { redisConnection } from "@platform/common/env";

export const NEWS_QUEUE_NAME = "news-ingestion";
export const NEWS_SCHEDULE_ID = "periodic-news-fetch";
export const NEWS_FETCH_INTERVAL_MS = 5 * 60 * 1000;

export function createNewsQueue(env: AppEnv): Queue<IngestionJob> {
  return new Queue<IngestionJob>(NEWS_QUEUE_NAME, {
    connection: redisConnection(env),
  });
}

export async function registerNewsSchedule(
  queue: Queue<IngestionJob>,
  tickers: readonly string[],
): Promise<void> {
  const data = IngestionJobSchema.parse({ tickers: [...tickers] });
  await queue.upsertJobScheduler(
    NEWS_SCHEDULE_ID,
    { every: NEWS_FETCH_INTERVAL_MS },
    {
      name: "fetch-news",
      data,
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
      },
    },
  );
}
