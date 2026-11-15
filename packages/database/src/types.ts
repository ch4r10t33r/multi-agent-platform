import type {
  NewsArticle,
  OrderRecord,
  Portfolio,
  TradingSignal,
} from "@platform/contracts";

export interface ArticleRepository {
  findByUrl(url: string): Promise<NewsArticle | undefined>;
  findById(articleId: string): Promise<NewsArticle | undefined>;
  upsertMany(articles: NewsArticle[]): Promise<NewsArticle[]>;
  listByTicker(ticker: string): Promise<NewsArticle[]>;
}

export interface SignalRepository {
  save(signal: TradingSignal): Promise<void>;
  get(signalId: string): Promise<TradingSignal | undefined>;
  list(): Promise<TradingSignal[]>;
}

export interface OrderRepository {
  getByIdempotencyKey(key: string): Promise<OrderRecord | undefined>;
  save(order: OrderRecord): Promise<void>;
  list(): Promise<OrderRecord[]>;
}

export interface PortfolioRepository {
  get(): Promise<Portfolio>;
  save(portfolio: Portfolio): Promise<void>;
}

export interface LedgerStores {
  orders: OrderRepository;
  portfolio: PortfolioRepository;
}

export interface TradingLedger extends LedgerStores {
  transaction<T>(work: (stores: LedgerStores) => Promise<T>): Promise<T>;
}

export interface AuditEvent {
  type: string;
  occurredAt: string;
  attributes: Record<string, string | number | boolean | null>;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
  list(): Promise<AuditEvent[]>;
}

export interface IngestionRun {
  runId: string;
  tickers: string[];
  startedAt: string;
  finishedAt?: string;
  insertedCount: number;
  status: "running" | "completed" | "failed";
}

export interface IngestionRunRepository {
  start(run: {
    runId: string;
    tickers: string[];
    startedAt: string;
  }): Promise<void>;
  finish(
    runId: string,
    result: {
      finishedAt: string;
      insertedCount: number;
      status: "completed" | "failed";
    },
  ): Promise<void>;
  list(): Promise<IngestionRun[]>;
}

export interface PlatformStores {
  articles: ArticleRepository;
  signals: SignalRepository;
  ledger: TradingLedger;
  audit: AuditLog;
  ingestionRuns: IngestionRunRepository;
  storage: "memory" | "postgres";
  close?: () => Promise<void>;
}
