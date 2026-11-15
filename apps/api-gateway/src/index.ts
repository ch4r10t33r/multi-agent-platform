import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import {
  connectPlatform,
  errorMessage,
  isPlatformError,
  setPlatform,
  type Platform,
} from "@platform/common";
import { registerPortfolioRoutes } from "./routes/portfolios.js";
import { registerSignalRoutes } from "./routes/signals.js";
import { registerTradeRoutes } from "./routes/trades.js";

export function buildApp(platform: Platform): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (isPlatformError(error)) {
      platform.logger.error("api.error", {
        code: error.code,
        message: error.message,
      });
      return reply
        .code(400)
        .send({ error: { code: error.code, message: error.message } });
    }
    platform.logger.error("api.error", {
      code: "internal_error",
      message: "Unexpected error",
    });
    return reply.code(500).send({
      error: { code: "internal_error", message: "Unexpected error" },
    });
  });
  app.get("/health", async () => ({
    status: "ok",
    tradingMode: platform.env.tradingMode,
    storage: platform.stores.storage,
  }));
  registerSignalRoutes(app, platform);
  registerTradeRoutes(app, platform);
  registerPortfolioRoutes(app, platform);
  return app;
}

async function main(): Promise<void> {
  const platform = await connectPlatform();
  setPlatform(platform);
  const app = buildApp(platform);
  await app.listen({ port: platform.env.port, host: "0.0.0.0" });
  platform.logger.info("api.started", { port: platform.env.port });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
