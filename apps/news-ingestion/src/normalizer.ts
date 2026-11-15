import { createHash } from "node:crypto";
import {
  NewsArticleSchema,
  type FetchedNews,
  type NewsArticle,
} from "@platform/contracts";

const TRACKING = new Set(["guccounter", "guce_referrer", "guce_referrer_sig"]);

export function canonicalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING.has(lower) || lower.startsWith("utm_"))
      url.searchParams.delete(key);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function articleIdFromUrl(url: string): string {
  return `url-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
}

export function normalizeArticle(
  fetched: FetchedNews,
  fetchedAt: Date,
): NewsArticle | undefined {
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(fetched.url);
  } catch {
    return undefined;
  }
  const published = new Date(fetched.publishedAt);
  if (Number.isNaN(published.getTime())) return undefined;
  const tickers = [
    ...new Set(fetched.tickers.map((ticker) => ticker.trim().toUpperCase())),
  ];
  const parsed = NewsArticleSchema.safeParse({
    articleId: fetched.articleId?.trim() || articleIdFromUrl(canonicalUrl),
    canonicalUrl,
    title: fetched.title.trim(),
    summary: (fetched.summary ?? "").trim(),
    source: fetched.source.trim() || "unknown",
    publishedAt: published.toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    tickers,
  });
  return parsed.success ? parsed.data : undefined;
}
