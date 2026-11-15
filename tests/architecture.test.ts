import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
function sourceOf(directory: string): string {
  const chunks: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (path.endsWith(".ts")) chunks.push(readFileSync(path, "utf8"));
    }
  };
  walk(directory);
  return chunks.join("\n");
}

describe("boundaries", () => {
  it("keeps the research agent away from order submission", () => {
    const source = sourceOf("agents/research-agent");
    expect(source).not.toContain("@platform/broker");
    expect(source).not.toContain("@platform/trade-executor");
    expect(source).not.toContain("submitOrder");
  });

  it("keeps ingestion from calling either agent", () => {
    const source = sourceOf("apps/news-ingestion");
    expect(source).not.toContain("@platform/research-agent");
    expect(source).not.toContain("@platform/execution-agent");
    expect(source).not.toContain("@platform/supervisor");
  });

  it("keeps the risk engine deterministic", () => {
    const source = sourceOf("packages/risk");
    expect(source).not.toContain("@langchain");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("@platform/broker");
  });
});
