import type { NewsSearch, ScoredArticle, VectorStore } from "./client.js";

export async function searchNews(
  store: VectorStore,
  query: NewsSearch,
): Promise<ScoredArticle[]> {
  return store.search(query);
}
