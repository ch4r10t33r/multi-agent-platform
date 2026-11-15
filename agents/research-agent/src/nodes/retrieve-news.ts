import {
  errorMessage,
  normalizeTicker,
  resolvePlatform,
} from "@platform/common";
import { searchNews } from "@platform/vector-store";
import type { ResearchState } from "../state.js";

export async function retrieveNews(
  state: typeof ResearchState.State,
  config: unknown,
): Promise<typeof ResearchState.Update> {
  const platform = resolvePlatform(config);
  let ticker: string;
  try {
    ticker = normalizeTicker(state.ticker);
  } catch (error) {
    return { articles: [], error: errorMessage(error) };
  }
  const vectors = await platform.embedder.embed([`${ticker} news`]);
  const embedding = vectors[0];
  if (!embedding) {
    return { ticker, articles: [], error: "Embedder returned no query vector" };
  }
  const matches = await searchNews(platform.vectors, {
    ticker,
    embedding,
    model: platform.embedder.model,
    limit: 8,
  });
  return {
    ticker,
    articles: matches.map((match) => match.article),
    error: null,
  };
}
