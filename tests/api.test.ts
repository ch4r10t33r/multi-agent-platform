import { buildApp } from "@platform/api-gateway";
import { runIngestionCycle } from "@platform/news-ingestion";
import { reconcilePlatform } from "@platform/trade-executor";
import { testPlatform } from "./helpers.js";

describe("api gateway", () => {
  it("runs the request path from ticker to paper portfolio", async () => {
    const platform = testPlatform();
    await runIngestionCycle(platform, ["NVDA"]);
    const app = buildApp(platform);
    await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const address = app.server.address();
      if (address === null || typeof address === "string") {
        throw new Error("API test server did not bind a port");
      }
      const base = `http://127.0.0.1:${address.port}`;
      const call = async (method: string, path: string, payload?: unknown) => {
        const response = await fetch(`${base}${path}`, {
          method,
          headers:
            payload === undefined
              ? undefined
              : { "content-type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        return {
          statusCode: response.status,
          body: (await response.json()) as unknown,
        };
      };

      const health = await call("GET", "/health");
      expect(health.body).toMatchObject({
        status: "ok",
        tradingMode: "paper",
        storage: "memory",
      });

      const created = await call("POST", "/signals", { ticker: "nvda" });
      expect(created.statusCode).toBe(201);
      const body = created.body as {
        signal: { signalId: string; action: string };
        order: { status: string; fillPrice: number };
      };
      expect(body.signal.action).toBe("BUY");
      expect(body.order.fillPrice).toBe(140);

      const listed = await call("GET", `/signals/${body.signal.signalId}`);
      expect(listed.statusCode).toBe(200);
      const portfolio = await call("GET", "/portfolios");
      const positions = (portfolio.body as { positions: { ticker: string }[] })
        .positions;
      expect(positions[0]?.ticker).toBe("NVDA");
      const trades = await call("GET", "/trades");
      expect((trades.body as { status: string }[])[0]?.status).toBe("FILLED");
      expect((await reconcilePlatform(platform)).ok).toBe(true);

      const invalid = await call("POST", "/signals", {
        ticker: "not a ticker",
      });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
