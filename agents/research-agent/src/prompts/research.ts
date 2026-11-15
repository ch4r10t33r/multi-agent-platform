import type { NewsArticle } from "@platform/contracts";

export const RESEARCH_SYSTEM_PROMPT = [
  "You review financial news for one ticker.",
  "Return JSON with sentiment from -1 to 1, materiality from 0 to 1, and a short summary.",
  "Do not propose a price, quantity, order, or trading action.",
  "Base sentiment only on the supplied articles.",
].join(" ");

export function researchUserPrompt(
  ticker: string,
  articles: readonly NewsArticle[],
): string {
  const lines = articles.map(
    (article) =>
      `- ${article.publishedAt} ${article.title}: ${article.summary}`,
  );
  return [
    `Ticker: ${ticker}`,
    lines.join("\n") || "No articles were indexed.",
  ].join("\n");
}
