import type { NewsArticle } from "@platform/contracts";
import type { ArticleRepository } from "@platform/database";
import type { VectorStore } from "@platform/vector-store";

/**
 * Keeps the first copy of each article and anything not yet embedded.
 * A stored article with no embedding is still pending so a failed job can retry.
 */
export async function deduplicate(
  articles: readonly NewsArticle[],
  repository: ArticleRepository,
  vectors: VectorStore,
  model: string,
): Promise<NewsArticle[]> {
  const seen = new Set<string>();
  const pending: NewsArticle[] = [];
  for (const article of articles) {
    if (seen.has(article.canonicalUrl) || seen.has(article.articleId)) continue;
    seen.add(article.canonicalUrl);
    seen.add(article.articleId);
    const existing = await repository.findByUrl(article.canonicalUrl);
    if (existing && (await vectors.has(existing.articleId, model))) continue;
    pending.push(existing ?? article);
  }
  return pending;
}
