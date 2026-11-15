import type {
  NewsArticle,
  OrderRecord,
  Portfolio,
  TradingSignal,
} from "@platform/contracts";
import type {
  ArticleRepository,
  AuditEvent,
  AuditLog,
  IngestionRun,
  IngestionRunRepository,
  OrderRepository,
  PlatformStores,
  PortfolioRepository,
  SignalRepository,
  TradingLedger,
} from "./types.js";

export class InMemoryArticleRepository implements ArticleRepository {
  private readonly byId = new Map<string, NewsArticle>();
  private readonly byUrl = new Map<string, string>();

  async findByUrl(url: string): Promise<NewsArticle | undefined> {
    const id = this.byUrl.get(url);
    return id ? this.byId.get(id) : undefined;
  }

  async findById(articleId: string): Promise<NewsArticle | undefined> {
    return this.byId.get(articleId);
  }

  async upsertMany(articles: NewsArticle[]): Promise<NewsArticle[]> {
    const inserted: NewsArticle[] = [];
    for (const article of articles) {
      if (
        this.byId.has(article.articleId) ||
        this.byUrl.has(article.canonicalUrl)
      ) {
        continue;
      }
      this.byId.set(article.articleId, article);
      this.byUrl.set(article.canonicalUrl, article.articleId);
      inserted.push(article);
    }
    return inserted;
  }

  async listByTicker(ticker: string): Promise<NewsArticle[]> {
    return [...this.byId.values()].filter((article) =>
      article.tickers.includes(ticker),
    );
  }
}

export class InMemorySignalRepository implements SignalRepository {
  private readonly byId = new Map<string, TradingSignal>();

  async save(signal: TradingSignal): Promise<void> {
    this.byId.set(signal.signalId, signal);
  }

  async get(signalId: string): Promise<TradingSignal | undefined> {
    return this.byId.get(signalId);
  }

  async list(): Promise<TradingSignal[]> {
    return [...this.byId.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  private records: OrderRecord[] = [];

  async getByIdempotencyKey(key: string): Promise<OrderRecord | undefined> {
    return this.records.find((order) => order.idempotencyKey === key);
  }

  async save(order: OrderRecord): Promise<void> {
    const index = this.records.findIndex(
      (item) =>
        item.orderId === order.orderId ||
        item.idempotencyKey === order.idempotencyKey,
    );
    if (index >= 0) {
      this.records[index] = order;
      return;
    }
    this.records.push(order);
  }

  async list(): Promise<OrderRecord[]> {
    return this.records.map((order) => ({ ...order }));
  }

  snapshot(): OrderRecord[] {
    return this.records.map((order) => ({ ...order }));
  }

  restore(records: OrderRecord[]): void {
    this.records = records.map((order) => ({ ...order }));
  }
}

export class InMemoryPortfolioRepository implements PortfolioRepository {
  private current: Portfolio;

  constructor(startingCash: number, currency: string) {
    this.current = {
      cash: startingCash,
      currency,
      realizedPnlToday: 0,
      positions: [],
    };
  }

  async get(): Promise<Portfolio> {
    return structuredClone(this.current);
  }

  async save(portfolio: Portfolio): Promise<void> {
    this.current = structuredClone(portfolio);
  }

  snapshot(): Portfolio {
    return structuredClone(this.current);
  }

  restore(portfolio: Portfolio): void {
    this.current = structuredClone(portfolio);
  }
}

export class InMemoryLedger implements TradingLedger {
  readonly orders = new InMemoryOrderRepository();
  readonly portfolio: InMemoryPortfolioRepository;
  private chain: Promise<void> = Promise.resolve();

  constructor(startingCash: number, currency: string) {
    this.portfolio = new InMemoryPortfolioRepository(startingCash, currency);
  }

  transaction<T>(
    work: (stores: {
      orders: OrderRepository;
      portfolio: PortfolioRepository;
    }) => Promise<T>,
  ): Promise<T> {
    const run = this.chain.then(async () => {
      const orders = this.orders.snapshot();
      const portfolio = this.portfolio.snapshot();
      try {
        return await work({ orders: this.orders, portfolio: this.portfolio });
      } catch (error) {
        this.orders.restore(orders);
        this.portfolio.restore(portfolio);
        throw error;
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async list(): Promise<AuditEvent[]> {
    return [...this.events];
  }
}

export class InMemoryIngestionRunRepository implements IngestionRunRepository {
  private readonly runs: IngestionRun[] = [];

  async start(run: {
    runId: string;
    tickers: string[];
    startedAt: string;
  }): Promise<void> {
    this.runs.push({ ...run, insertedCount: 0, status: "running" });
  }

  async finish(
    runId: string,
    result: {
      finishedAt: string;
      insertedCount: number;
      status: "completed" | "failed";
    },
  ): Promise<void> {
    const run = this.runs.find((item) => item.runId === runId);
    if (!run) return;
    run.finishedAt = result.finishedAt;
    run.insertedCount = result.insertedCount;
    run.status = result.status;
  }

  async list(): Promise<IngestionRun[]> {
    return this.runs.map((run) => ({ ...run, tickers: [...run.tickers] }));
  }
}

export function createMemoryStores(input: {
  startingCash: number;
  currency: string;
}): PlatformStores {
  return {
    articles: new InMemoryArticleRepository(),
    signals: new InMemorySignalRepository(),
    ledger: new InMemoryLedger(input.startingCash, input.currency),
    audit: new InMemoryAuditLog(),
    ingestionRuns: new InMemoryIngestionRunRepository(),
    storage: "memory",
  };
}
