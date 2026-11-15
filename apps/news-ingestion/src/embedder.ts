import type { NewsArticle } from "@platform/contracts";
import { PlatformError } from "@platform/common/errors";
import type { Embedder } from "@platform/llm";
import { articleDocument, type EmbeddedArticle } from "@platform/vector-store";

export async function embedArticles(
  embedder: Embedder,
  articles: readonly NewsArticle[],
): Promise<EmbeddedArticle[]> {
  if (articles.length === 0) return [];
  const vectors = await embedder.embed(articles.map(articleDocument));
  if (vectors.length !== articles.length) {
    throw new PlatformError(
      "embedding_failed",
      "Embedder returned a different number of vectors than articles",
    );
  }
  return articles.map((article, index) => {
    const embedding = vectors[index];
    if (!embedding || embedding.length !== embedder.dimensions) {
      throw new PlatformError(
        "embedding_failed",
        "Embedder returned a vector with the wrong dimensions",
      );
    }
    return { article, embedding, model: embedder.model };
  });
}
