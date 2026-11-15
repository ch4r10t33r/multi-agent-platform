import { PaperBroker, type Broker } from "@platform/broker";
import type { NewsProvider, QuoteProvider } from "@platform/contracts";
import {
  createMemoryStores,
  openDatabase,
  type PlatformStores,
} from "@platform/database";
import { createEmbedder, type Embedder } from "@platform/llm";
import { createNewsProvider, createQuoteProvider } from "@platform/market-data";
import { createLogger, type Logger } from "@platform/observability";
import { loadRiskPolicy, type RiskPolicy } from "@platform/risk";
import { InMemoryEventBus, type EventBus } from "@platform/shared-state";
import { InMemoryVectorStore, type VectorStore } from "@platform/vector-store";
import { EMBEDDING_DIMENSIONS, PLATFORM_BRAND } from "./constants.js";
import type { AppEnv } from "./env.js";
import { getEnv } from "./env.js";
import { PlatformError } from "./errors.js";

export interface Platform {
  readonly [PLATFORM_BRAND]: true;
  readonly env: AppEnv;
  readonly policy: RiskPolicy;
  readonly stores: PlatformStores;
  readonly articles: PlatformStores["articles"];
  readonly signals: PlatformStores["signals"];
  readonly ledger: PlatformStores["ledger"];
  readonly audit: PlatformStores["audit"];
  readonly ingestionRuns: PlatformStores["ingestionRuns"];
  readonly vectors: VectorStore;
  readonly embedder: Embedder;
  readonly news: NewsProvider;
  readonly quotes: QuoteProvider;
  readonly broker: Broker;
  readonly events: EventBus;
  readonly logger: Logger;
  close(): Promise<void>;
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "object" && value !== null && PLATFORM_BRAND in value;
}

export interface PlatformOptions {
  env?: AppEnv;
  policy?: RiskPolicy;
  stores?: PlatformStores;
  vectors?: VectorStore;
  embedder?: Embedder;
  news?: NewsProvider;
  quotes?: QuoteProvider;
  broker?: Broker;
}

export function createPlatform(options: PlatformOptions = {}): Platform {
  const env = options.env ?? getEnv();
  if (env.embeddingDimensions !== EMBEDDING_DIMENSIONS) {
    throw new PlatformError(
      "invalid_config",
      `EMBEDDING_DIMENSIONS must be ${EMBEDDING_DIMENSIONS} to match the vector column`,
    );
  }
  const policy = options.policy ?? loadRiskPolicy();
  const stores =
    options.stores ??
    createMemoryStores({
      startingCash: policy.startingCash,
      currency: policy.currency,
    });
  return {
    [PLATFORM_BRAND]: true,
    env,
    policy,
    stores,
    articles: stores.articles,
    signals: stores.signals,
    ledger: stores.ledger,
    audit: stores.audit,
    ingestionRuns: stores.ingestionRuns,
    vectors: options.vectors ?? new InMemoryVectorStore(),
    embedder: options.embedder ?? createEmbedder(env),
    news: options.news ?? createNewsProvider(env),
    quotes: options.quotes ?? createQuoteProvider(env),
    broker: options.broker ?? new PaperBroker(stores.ledger),
    events: new InMemoryEventBus(),
    logger: createLogger(env.logLevel),
    async close() {
      await stores.close?.();
    },
  };
}

export async function connectPlatform(
  options: { env?: AppEnv; policy?: RiskPolicy } = {},
): Promise<Platform> {
  const env = options.env ?? getEnv();
  if (!env.databaseUrl) return createPlatform({ ...options, env });
  const connected = await openDatabase(env.databaseUrl);
  return createPlatform({
    env,
    policy: options.policy,
    stores: connected.stores,
    vectors: connected.vectors,
  });
}
