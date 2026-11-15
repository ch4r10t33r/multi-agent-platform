import { PlatformError } from "./errors.js";

export type NewsProviderName = "fixture" | "yahoo";
export type QuoteProviderName = "fixture" | "yahoo";
export type AnalystProviderName = "lexicon" | "sglang" | "openai";
export type LogLevel = "debug" | "info" | "error";

export interface AppEnv {
  analystProvider: AnalystProviderName;
  sglangBaseUrl: string;
  sglangModel: string;
  openAiApiKey?: string;
  openAiModel: string;
  openAiEmbeddingModel: string;
  databaseUrl?: string;
  redisHost?: string;
  redisPort?: number;
  tradingMode: "paper";
  newsProvider: NewsProviderName;
  quoteProvider: QuoteProviderName;
  logLevel: LogLevel;
  port: number;
  embeddingDimensions: number;
}

export type EnvSource = Record<string, string | undefined>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  cached ??= readEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}

export function readEnv(source: EnvSource): AppEnv {
  const tradingMode = source.TRADING_MODE ?? "paper";
  if (tradingMode !== "paper") {
    throw new PlatformError(
      "live_trading_disabled",
      "TRADING_MODE must be paper. Live execution is not part of this scaffold.",
    );
  }
  const analystProvider = readChoice(
    source.ANALYST_PROVIDER ?? "lexicon",
    ["lexicon", "sglang", "openai"] as const,
    "ANALYST_PROVIDER",
  );
  const openAiApiKey = emptyToUndefined(source.OPENAI_API_KEY);
  if (analystProvider === "openai" && !openAiApiKey) {
    throw new PlatformError(
      "invalid_config",
      "OPENAI_API_KEY is required when ANALYST_PROVIDER is openai",
    );
  }

  return {
    analystProvider,
    sglangBaseUrl: stripTrailingSlash(
      source.SGLANG_BASE_URL ?? "http://127.0.0.1:30000/v1",
    ),
    sglangModel: source.SGLANG_MODEL?.trim() || "Qwen/Qwen2.5-1.5B-Instruct",
    openAiApiKey,
    openAiModel: source.OPENAI_MODEL ?? "gpt-4o-mini",
    openAiEmbeddingModel:
      source.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    databaseUrl: emptyToUndefined(source.DATABASE_URL),
    redisHost: emptyToUndefined(source.REDIS_HOST),
    redisPort: readOptionalPort(source.REDIS_PORT),
    tradingMode,
    newsProvider: readChoice(
      source.NEWS_PROVIDER ?? "fixture",
      ["fixture", "yahoo"] as const,
      "NEWS_PROVIDER",
    ),
    quoteProvider: readChoice(
      source.QUOTE_PROVIDER ?? "fixture",
      ["fixture", "yahoo"] as const,
      "QUOTE_PROVIDER",
    ),
    logLevel: readChoice(
      source.LOG_LEVEL ?? "info",
      ["debug", "info", "error"] as const,
      "LOG_LEVEL",
    ),
    port: readPort(source.PORT),
    embeddingDimensions: readPositiveInt(
      source.EMBEDDING_DIMENSIONS,
      64,
      "EMBEDDING_DIMENSIONS",
    ),
  };
}

export function redisConnection(env: AppEnv): { host: string; port: number } {
  if (!env.redisHost) {
    throw new PlatformError(
      "redis_not_configured",
      "REDIS_HOST is required to run the news ingestion queue",
    );
  }
  return { host: env.redisHost, port: env.redisPort ?? 6379 };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PlatformError(
      "invalid_config",
      "PORT must be an integer between 1 and 65535",
    );
  }
  return port;
}

function readOptionalPort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PlatformError(
      "invalid_config",
      "REDIS_PORT must be an integer between 1 and 65535",
    );
  }
  return port;
}

function readPositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new PlatformError(
      "invalid_config",
      `${name} must be a positive integer`,
    );
  }
  return parsed;
}

function readChoice<const T extends readonly string[]>(
  value: string,
  allowed: T,
  name: string,
): T[number] {
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw new PlatformError(
      "invalid_config",
      `${name} must be one of ${allowed.join(", ")}`,
    );
  }
  return match;
}
