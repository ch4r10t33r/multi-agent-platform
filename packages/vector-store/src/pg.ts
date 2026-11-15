import { NewsArticleSchema } from "@platform/contracts";
import { formatIssues, PlatformError } from "@platform/common/errors";
import {
  assertVector,
  toVectorLiteral,
  type EmbeddedArticle,
  type NewsSearch,
  type ScoredArticle,
  type VectorStore,
} from "./client.js";

export interface Sql {
  query<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}

export class PgVectorStore implements VectorStore {
  constructor(private readonly sql: Sql) {}

  async upsert(items: readonly EmbeddedArticle[]): Promise<void> {
    for (const item of items) {
      assertVector(item.embedding);
      await this.sql.query(
        `insert into market.article_embeddings (article_id, model, embedding)
         values ($1, $2, $3::vector)
         on conflict (article_id) do update
           set model = excluded.model,
               embedding = excluded.embedding,
               updated_at = now()`,
        [item.article.articleId, item.model, toVectorLiteral(item.embedding)],
      );
    }
  }

  async search(query: NewsSearch): Promise<ScoredArticle[]> {
    assertVector(query.embedding);
    const result = await this.sql.query<{
      payload: unknown;
      score: number | string;
    }>(
      `select a.payload,
              1 - (e.embedding <=> $1::vector) as score
         from market.article_embeddings e
         join market.articles a on a.article_id = e.article_id
        where e.model = $2
          and $3 = any (a.tickers)
        order by e.embedding <=> $1::vector
        limit $4`,
      [
        toVectorLiteral(query.embedding),
        query.model,
        query.ticker,
        query.limit,
      ],
    );
    return result.rows.map((row) => {
      const parsed = NewsArticleSchema.safeParse(row.payload);
      if (!parsed.success) {
        throw new PlatformError(
          "database_row",
          formatIssues(parsed.error.issues),
        );
      }
      return { article: parsed.data, score: Number(row.score) };
    });
  }

  async has(articleId: string, model: string): Promise<boolean> {
    const result = await this.sql.query(
      `select 1 from market.article_embeddings where article_id = $1 and model = $2`,
      [articleId, model],
    );
    return result.rows.length > 0;
  }
}
