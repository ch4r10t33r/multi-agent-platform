export { deduplicate } from "./deduplicator.js";
export { embedArticles } from "./embedder.js";
export { fetchNews } from "./fetcher.js";
export {
  articleIdFromUrl,
  canonicalizeUrl,
  normalizeArticle,
} from "./normalizer.js";
export {
  NEWS_FETCH_INTERVAL_MS,
  NEWS_QUEUE_NAME,
  NEWS_SCHEDULE_ID,
  createNewsQueue,
  registerNewsSchedule,
} from "./scheduler.js";
export { runIngestionCycle, startNewsWorker } from "./worker.js";
export type { IngestionResult } from "./worker.js";
