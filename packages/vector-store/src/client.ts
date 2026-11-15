import type { NewsArticle } from "@platform/contracts";
import { EMBEDDING_DIMENSIONS } from "@platform/common/constants";
import { PlatformError } from "@platform/common/errors";

export interface EmbeddedArticle {
  article: NewsArticle;
  model: string;
  embedding: number[];
}

export interface NewsSearch {
  ticker: string;
  embedding: number[];
  model: string;
  limit: number;
}

export interface ScoredArticle {
  article: NewsArticle;
  score: number;
}

export interface VectorStore {
  upsert(items: readonly EmbeddedArticle[]): Promise<void>;
  search(query: NewsSearch): Promise<ScoredArticle[]>;
  has(articleId: string, model: string): Promise<boolean>;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly items: EmbeddedArticle[] = [];

  async upsert(items: readonly EmbeddedArticle[]): Promise<void> {
    for (const item of items) {
      assertVector(item.embedding);
      const index = this.items.findIndex(
        (existing) =>
          existing.article.articleId === item.article.articleId &&
          existing.model === item.model,
      );
      if (index >= 0) this.items[index] = item;
      else this.items.push(item);
    }
  }

  async search(query: NewsSearch): Promise<ScoredArticle[]> {
    assertVector(query.embedding);
    return this.items
      .filter(
        (item) =>
          item.model === query.model &&
          item.article.tickers.includes(query.ticker),
      )
      .map((item) => ({
        article: item.article,
        score: cosineSimilarity(query.embedding, item.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit);
  }

  async has(articleId: string, model: string): Promise<boolean> {
    return this.items.some(
      (item) => item.article.articleId === articleId && item.model === model,
    );
  }
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function assertVector(values: readonly number[]): void {
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new PlatformError(
      "embedding_dimensions",
      `Embeddings must be ${EMBEDDING_DIMENSIONS} finite dimensions`,
    );
  }
}

export function toVectorLiteral(values: readonly number[]): string {
  assertVector(values);
  return `[${values.join(",")}]`;
}
