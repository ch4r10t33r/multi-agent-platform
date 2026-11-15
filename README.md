# Financial research and paper trading

Event-driven research platform. A news pipeline indexes articles on its own. A research agent turns that evidence into a structured signal. A separate execution agent can submit a paper order only after deterministic risk checks.

The research agent has no broker client. Live trading is rejected at startup.

## Flow

1. News ingestion fetches, normalises, deduplicates, embeds, and stores articles.
2. It publishes `news.updated`. It does not call an agent.
3. The trading orchestrator asks the research agent for a `BUY`, `SELL_LONG`, `SELL_SHORT`, or `HOLD` signal.
4. Target prices come from the current quote and the `news-momentum-v1` strategy.
5. The execution agent validates the signal, runs the risk engine, and requests approval when the notional is above the policy threshold.
6. An approved order is a paper fill. The idempotency key is the signal id.

`SELL_LONG` closes a long position. `SELL_SHORT` opens a short. Shorts are off in the default policy.

## Layout

- `apps/news-ingestion` schedules a BullMQ job every five minutes when Redis is configured.
- `apps/trade-executor` submits and reconciles orders.
- `apps/api-gateway` exposes `/signals`, `/trades`, and `/portfolios`.
- `apps/agent-server` registers the three LangGraph graphs.
- `agents/research-agent`, `agents/execution-agent`, and `agents/supervisor` are those graphs.
- `packages/risk` is the deterministic limit check. Model output cannot override it.
- `packages/contracts` is the shared signal, news, and order schema.
- `infrastructure/docker` runs PostgreSQL with pgvector, plus Redis.

Signals, orders, articles, and embeddings are business records. LangGraph checkpoints stay in the separate `langgraph` schema.

## Run the paper demo

```bash
pnpm install
pnpm demo
```

The demo uses an in-memory ledger, a bundled news feed, and a lexicon scorer. No API key is required. NVDA news is positive, so the paper account buys. TSLA news is negative and the account is flat, so the result is `HOLD`.

```bash
pnpm test
pnpm dev:api
```

`POST /signals` with `{ "ticker": "NVDA" }` runs the same orchestrator. Orders above the approval threshold return `PENDING_APPROVAL`. Approve them with `POST /signals/:signalId/approval` and `{ "approval": "granted" }`.

## Optional infrastructure

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

Copy `.env.example` to `.env` and uncomment `DATABASE_URL` and the Redis settings. `pnpm dev:api` then uses Postgres. `pnpm ingest:once` runs one ingestion cycle. Without Redis, omit `--once` only after Redis is up; the scheduled worker uses BullMQ rather than a timer.

`NEWS_PROVIDER=yahoo` and `QUOTE_PROVIDER=yahoo` call unofficial Yahoo Finance endpoints. Yahoo does not document a general-purpose public news API. Check the current terms, rate limits, and retention rules before enabling them. The default provider is the local fixture feed.

Set `OPENAI_API_KEY` to score news with a model. The model may return sentiment only. It does not choose the target price. If the call fails, scoring falls back to the lexicon.

## Graphs

From the repository root:

```bash
pnpm exec @langchain/langgraph-cli dev
```

`langgraph.json` registers `research_agent`, `execution_agent`, and `trading_orchestrator`.

## Safety defaults

- Signals expire, and execution also rejects signals older than the policy age.
- Market-data age is checked separately from news age.
- Order size is capped by the strategy and by the risk policy.
- Human approval is required above the configured notional.
- Paper fills use an idempotency key so a retry does not double-buy.
- The broker can halt. A halted broker rejects new orders.
- The daily loss limit stops new risk approvals.
- Reconciliation compares the ledger with the broker order list.
- Every terminal execution decision is written to the audit log.
