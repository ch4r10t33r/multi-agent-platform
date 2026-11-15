import type { NewsArticle } from "@platform/contracts";
import type { EmbeddedArticle, VectorStore } from "./client.js";

export function articleDocument(article: NewsArticle): string {
  return `${article.tickers.join(" ")} ${article.title} ${article.summary}`;
}

export async function indexNews(
  store: VectorStore,
  items: readonly EmbeddedArticle[],
): Promise<void> {
  await store.upsert(items);
}
