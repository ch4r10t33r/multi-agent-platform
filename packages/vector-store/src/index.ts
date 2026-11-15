export {
  InMemoryVectorStore,
  assertVector,
  cosineSimilarity,
  toVectorLiteral,
} from "./client.js";
export type {
  EmbeddedArticle,
  NewsSearch,
  ScoredArticle,
  VectorStore,
} from "./client.js";
export { articleDocument, indexNews } from "./index-news.js";
export { PgVectorStore } from "./pg.js";
export type { Sql } from "./pg.js";
export { searchNews } from "./search-news.js";
