import { randomUUID } from "node:crypto";
import {
  NewsArticleSchema,
  OrderRecordSchema,
  PortfolioSchema,
  TradingSignalSchema,
  type NewsArticle,
  type OrderRecord,
  type Portfolio,
  type TradingSignal,
} from "@platform/contracts";
import {
  errorMessage,
  formatIssues,
  isPlatformError,
  PlatformError,
} from "@platform/common/errors";
import {
  PgVectorStore,
  type Sql,
  type VectorStore,
} from "@platform/vector-store";
import pg from "pg";
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

const { Pool } = pg;

export interface ConnectedDatabase {
  stores: PlatformStores;
  vectors: VectorStore;
}

function asSql(client: pg.Pool | pg.PoolClient): Sql {
  return {
    async query<Row = Record<string, unknown>>(
      statement: string,
      params?: readonly unknown[],
    ) {
      const result = await client.query(
        statement,
        params ? [...params] : undefined,
      );
      return { rows: result.rows as Row[] };
    },
  };
}

class PgArticleRepository implements ArticleRepository {
  constructor(private readonly sql: Sql) {}

  async findByUrl(url: string) {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from market.articles where canonical_url = $1",
      [url],
    );
    return parseOptional(result.rows[0]?.payload, NewsArticleSchema);
  }

  async findById(articleId: string) {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from market.articles where article_id = $1",
      [articleId],
    );
    return parseOptional(result.rows[0]?.payload, NewsArticleSchema);
  }

  async upsertMany(articles: NewsArticle[]) {
    const inserted = [];
    for (const article of articles) {
      const result = await this.sql.query(
        `insert into market.articles (
           article_id, canonical_url, title, summary, source, published_at, fetched_at, tickers, payload
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         on conflict do nothing
         returning article_id`,
        [
          article.articleId,
          article.canonicalUrl,
          article.title,
          article.summary,
          article.source,
          article.publishedAt,
          article.fetchedAt,
          article.tickers,
          JSON.stringify(article),
        ],
      );
      if (result.rows.length > 0) inserted.push(article);
    }
    return inserted;
  }

  async listByTicker(ticker: string) {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from market.articles where $1 = any (tickers) order by published_at desc",
      [ticker],
    );
    return result.rows.map((row) =>
      parseRequired(row.payload, NewsArticleSchema),
    );
  }
}

class PgSignalRepository implements SignalRepository {
  constructor(private readonly sql: Sql) {}

  async save(signal: TradingSignal) {
    await this.sql.query(
      `insert into trading.signals (signal_id, ticker, action, payload, created_at, expires_at)
       values ($1, $2, $3, $4::jsonb, $5, $6)
       on conflict (signal_id) do update set payload = excluded.payload, action = excluded.action`,
      [
        signal.signalId,
        signal.ticker,
        signal.action,
        JSON.stringify(signal),
        signal.createdAt,
        signal.expiresAt,
      ],
    );
  }

  async get(signalId: string) {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from trading.signals where signal_id = $1",
      [signalId],
    );
    return parseOptional(result.rows[0]?.payload, TradingSignalSchema);
  }

  async list() {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from trading.signals order by created_at desc",
    );
    return result.rows.map((row) =>
      parseRequired(row.payload, TradingSignalSchema),
    );
  }
}

class PgOrderRepository implements OrderRepository {
  constructor(private readonly sql: Sql) {}

  async getByIdempotencyKey(key: string) {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from trading.orders where idempotency_key = $1",
      [key],
    );
    return parseOptional(result.rows[0]?.payload, OrderRecordSchema);
  }

  async save(order: OrderRecord) {
    await this.sql.query(
      `insert into trading.orders (
         order_id, idempotency_key, signal_id, ticker, status, payload, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       on conflict (idempotency_key) do update
         set status = excluded.status,
             payload = excluded.payload,
             updated_at = excluded.updated_at`,
      [
        order.orderId,
        order.idempotencyKey,
        order.signalId,
        order.ticker,
        order.status,
        JSON.stringify(order),
        order.createdAt,
        order.updatedAt,
      ],
    );
  }

  async list() {
    const result = await this.sql.query<{ payload: unknown }>(
      "select payload from trading.orders order by created_at desc",
    );
    return result.rows.map((row) =>
      parseRequired(row.payload, OrderRecordSchema),
    );
  }
}

class PgPortfolioRepository implements PortfolioRepository {
  constructor(private readonly sql: Sql) {}

  async get() {
    const account = await this.sql.query<{
      cash: unknown;
      currency: unknown;
      realized_pnl_today: unknown;
    }>(
      "select cash, currency, realized_pnl_today from trading.accounts where account_id = 'primary'",
    );
    const row = account.rows[0];
    if (!row) {
      throw new PlatformError(
        "database_row",
        "Paper trading account is missing",
      );
    }
    const positions = await this.sql.query<{
      ticker: unknown;
      quantity: unknown;
      average_price: unknown;
    }>(
      "select ticker, quantity, average_price from trading.positions order by ticker",
    );
    return PortfolioSchema.parse({
      cash: asNumber(row.cash),
      currency: row.currency,
      realizedPnlToday: asNumber(row.realized_pnl_today),
      positions: positions.rows.map((position) => ({
        ticker: position.ticker,
        quantity: asNumber(position.quantity),
        averagePrice: asNumber(position.average_price),
      })),
    });
  }

  async save(portfolio: Portfolio) {
    await this.sql.query(
      `update trading.accounts
          set cash = $1, currency = $2, realized_pnl_today = $3, updated_at = now()
        where account_id = 'primary'`,
      [portfolio.cash, portfolio.currency, portfolio.realizedPnlToday],
    );
    await this.sql.query("delete from trading.positions");
    for (const position of portfolio.positions) {
      await this.sql.query(
        `insert into trading.positions (ticker, quantity, average_price, updated_at)
         values ($1, $2, $3, now())`,
        [position.ticker, position.quantity, position.averagePrice],
      );
    }
  }
}

class PgLedger implements TradingLedger {
  readonly orders: OrderRepository;
  readonly portfolio: PortfolioRepository;

  constructor(private readonly pool: pg.Pool) {
    const sql = asSql(pool);
    this.orders = new PgOrderRepository(sql);
    this.portfolio = new PgPortfolioRepository(sql);
  }

  async transaction<T>(
    work: (stores: {
      orders: OrderRepository;
      portfolio: PortfolioRepository;
    }) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select cash from trading.accounts where account_id = 'primary' for update",
      );
      const sql = asSql(client);
      const result = await work({
        orders: new PgOrderRepository(sql),
        portfolio: new PgPortfolioRepository(sql),
      });
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error(
          JSON.stringify({
            event: "database.rollback_failed",
            message: errorMessage(rollbackError),
          }),
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

class PgAuditLog implements AuditLog {
  constructor(private readonly sql: Sql) {}

  async record(event: AuditEvent) {
    await this.sql.query(
      `insert into ops.audit_events (event_id, event_type, occurred_at, attributes)
       values ($1, $2, $3, $4::jsonb)`,
      [
        randomUUID(),
        event.type,
        event.occurredAt,
        JSON.stringify(event.attributes),
      ],
    );
  }

  async list() {
    const result = await this.sql.query<{
      event_type: string;
      occurred_at: unknown;
      attributes: unknown;
    }>(
      "select event_type, occurred_at, attributes from ops.audit_events order by occurred_at",
    );
    return result.rows.map((row) => ({
      type: row.event_type,
      occurredAt: asIso(row.occurred_at),
      attributes: asAttributes(row.attributes),
    }));
  }
}

class PgIngestionRunRepository implements IngestionRunRepository {
  constructor(private readonly sql: Sql) {}

  async start(run: { runId: string; tickers: string[]; startedAt: string }) {
    await this.sql.query(
      `insert into market.ingestion_runs (run_id, tickers, started_at, inserted_count, status)
       values ($1, $2, $3, 0, 'running')`,
      [run.runId, run.tickers, run.startedAt],
    );
  }

  async finish(
    runId: string,
    result: {
      finishedAt: string;
      insertedCount: number;
      status: "completed" | "failed";
    },
  ) {
    await this.sql.query(
      `update market.ingestion_runs
          set finished_at = $2, inserted_count = $3, status = $4
        where run_id = $1`,
      [runId, result.finishedAt, result.insertedCount, result.status],
    );
  }

  async list() {
    const result = await this.sql.query<{
      run_id: string;
      tickers: string[];
      started_at: unknown;
      finished_at: unknown;
      inserted_count: unknown;
      status: IngestionRun["status"];
    }>(
      "select run_id, tickers, started_at, finished_at, inserted_count, status from market.ingestion_runs order by started_at",
    );
    return result.rows.map((row) => ({
      runId: row.run_id,
      tickers: row.tickers,
      startedAt: asIso(row.started_at),
      finishedAt: row.finished_at ? asIso(row.finished_at) : undefined,
      insertedCount: asNumber(row.inserted_count),
      status: row.status,
    }));
  }
}

function parseRequired<T>(
  value: unknown,
  schema: { parse: (input: unknown) => T },
): T {
  return schema.parse(value);
}

function parseOptional<T>(
  value: unknown,
  schema: {
    safeParse: (input: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { path: PropertyKey[]; message: string }[] };
        };
  },
): T | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new PlatformError("database_row", formatIssues(parsed.error.issues));
  }
  return parsed.data;
}

function asNumber(value: unknown): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new PlatformError(
      "database_row",
      "Expected a numeric database value",
    );
  }
  return number;
}

function asIso(value: unknown): string {
  if (typeof value === "string") return new Date(value).toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toISOString" in value &&
    typeof value.toISOString === "function"
  ) {
    const iso: unknown = value.toISOString();
    if (typeof iso === "string") return iso;
  }
  throw new PlatformError("database_row", "Expected a timestamp");
}

function asAttributes(
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlatformError("database_row", "Expected audit attributes");
  }
  const attributes: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      attributes[key] = entry;
    }
  }
  return attributes;
}

export async function openDatabase(
  connectionString: string,
): Promise<ConnectedDatabase> {
  const pool = new Pool({ connectionString });
  const sql = asSql(pool);
  try {
    const extension = await sql.query(
      "select extname from pg_extension where extname = 'vector'",
    );
    if (extension.rows.length === 0) {
      throw new PlatformError(
        "database_not_ready",
        "pgvector is not installed. Apply infrastructure/migrations/001_init.sql.",
      );
    }
    const account = await sql.query(
      "select account_id from trading.accounts where account_id = 'primary'",
    );
    if (account.rows.length === 0) {
      throw new PlatformError(
        "database_not_ready",
        "The paper trading account is missing. Apply infrastructure/migrations/001_init.sql.",
      );
    }
  } catch (error) {
    await pool.end();
    if (isPlatformError(error)) throw error;
    throw new PlatformError(
      "database_not_ready",
      `PostgreSQL is not ready. Apply infrastructure/migrations/001_init.sql. ${errorMessage(error)}`,
    );
  }

  return {
    stores: {
      articles: new PgArticleRepository(sql),
      signals: new PgSignalRepository(sql),
      ledger: new PgLedger(pool),
      audit: new PgAuditLog(sql),
      ingestionRuns: new PgIngestionRunRepository(sql),
      storage: "postgres",
      close: async () => {
        await pool.end();
      },
    },
    vectors: new PgVectorStore(sql),
  };
}
