# Financial research and paper trading

Event-driven research platform. A news pipeline indexes articles on its own. A research agent turns that evidence into a structured signal. A separate execution agent can submit a paper order only after deterministic risk checks.

The research agent has no broker client. Live trading is rejected at startup.

## Getting started

You need Node.js 20 or newer and pnpm 12. From the repository root:

```bash
pnpm install
pnpm demo
```

`pnpm demo` runs one pass with no database, Redis, API key, or GPU:

1. It ingests NVDA and TSLA news.
2. The research agent scores that news and builds a signal. Prices and the order action come from the quote and the `news-momentum-v1` strategy.
3. The execution agent risk-checks the signal and, when it passes, records a paper fill.
4. The process prints both results as JSON and exits.

With the default `NEWS_PROVIDER=fixture`, the bundled NVDA story is positive, so the paper account buys. The bundled TSLA story is negative and the account is flat, so the result is `HOLD`.

`pnpm demo` and `pnpm test` load `.env` from the repository root. `pnpm dev:api`, `pnpm ingest:once`, and `pnpm reconcile` use the shell environment. Load the file before those commands:

```bash
cp .env.example .env
set -a && source .env && set +a
pnpm dev:api
```

The API listens on port 3000 (`PORT` in `.env`).

```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/signals \
  -H 'content-type: application/json' \
  -d '{"ticker":"NVDA"}'
```

`POST /signals` runs the same orchestrator as the demo. It reads news that has already been indexed. On a fresh in-memory process, ingest first or the research agent has no articles. `pnpm demo` does that ingest itself.

## How the programs run

Nothing starts all of the apps together. Each entry under `apps/` is a separate program, and you start the one you need. `pnpm demo` is a fifth, short-lived program: it performs ingestion and research in one process and then exits.

Two processes share articles, signals, and orders when both are started with the same `DATABASE_URL`. That URL selects Postgres, and the article vectors go in the `market.article_embeddings` pgvector column. With `DATABASE_URL` unset, `connectPlatform` builds a private in-memory store for that process. Data written by the ingestion process is then invisible to the API process.

Each process also has its own in-memory event bus. `news.updated` reaches a listener only when that listener subscribed in the same process. The demo subscribes, so a freshly indexed ticker immediately runs the orchestrator. The API process does not subscribe. After the ingestion worker writes to Postgres, research runs when something calls `POST /signals`.

```text
news-ingestion                api-gateway
fetch → embed → store         POST /signals
        │                            │
        ▼                            ▼
   Postgres + pgvector  ◀──  supervisor graph
   market.articles              research agent
   market.article_embeddings    execution agent
                                paper fill in trading.orders
```

| Program | How it starts | What it does | How long it runs |
| --- | --- | --- | --- |
| `pnpm demo` | `scripts/demo.ts` | Ingests NVDA and TSLA, then runs the orchestrator on `news.updated` inside that same process. Always uses memory, including when `DATABASE_URL` is set. | Exits after printing JSON. |
| `apps/news-ingestion` | `pnpm ingest:once`, or `pnpm exec tsx apps/news-ingestion/src/worker.ts` | Fetches news for `infrastructure/config/tickers.json`, embeds it, and stores articles. The worker path repeats every five minutes through BullMQ. | `--once` exits. The worker stays up and needs Redis. |
| `apps/api-gateway` | `pnpm dev:api` | HTTP API on port 3000. `POST /signals` invokes the supervisor graph in this process. `GET /trades` and `GET /portfolios` read the ledger. | Stays up until you stop it. |
| `apps/agent-server` | No start script in this repo | Re-exports the three graphs. `apps/agent-server/langgraph.json` is the registration file for an external LangGraph server. The demo and the API call the graphs directly and do not boot this package. | Does not listen on a port here. |
| `apps/trade-executor` | `pnpm reconcile` | Compares the ledger with the paper broker once and prints the report. Paper fills themselves are submitted by the execution agent inside the demo or the API, not by a standing executor process. | Exits after the report. |

A periodic load into pgvector needs both of these:

1. `DATABASE_URL` pointing at the Postgres service from `infrastructure/docker/docker-compose.yml`.
2. The ingestion worker running without `--once`, which also needs `REDIS_HOST`.

Each cycle then upserts `market.articles` and writes 64-dimensional embeddings to `market.article_embeddings`. The research agent later searches that column by ticker and cosine distance. The worker does not call the research agent.

`apps/api-gateway` is the HTTP front door. A `POST /signals` request runs `trading_orchestrator` in the API process: research reads the index, the strategy sets the price and action, and the execution agent risk-checks and, when approved, records a paper order in the same database. `apps/agent-server` is the graph registry for LangGraph Server. It is not the process that serves `/signals`.

## Configuration

Copy `.env.example` to `.env`. Every setting has a default, so the copy is only needed when you change one.

| Setting | Default | Effect |
| --- | --- | --- |
| `TRADING_MODE` | `paper` | Any other value refuses to start. |
| `NEWS_PROVIDER` | `fixture` | `fixture` uses the stories in `packages/market-data/src/fixture-news.ts`. `yahoo` calls Yahoo Finance's unofficial search endpoint. |
| `QUOTE_PROVIDER` | `fixture` | `fixture` uses the prices in `packages/market-data/src/fixture-quotes.ts`. `yahoo` calls Yahoo Finance for quotes. |
| `ANALYST_PROVIDER` | `lexicon` | Scores sentiment in process. `sglang` and `openai` are optional and described below. |
| `DATABASE_URL` | unset | Unset keeps articles, signals, and orders in memory. Set it to use Postgres. |
| `REDIS_HOST` | unset | Required only for the scheduled ingestion worker. |
| `PORT` | `3000` | API port. |

`NEWS_PROVIDER=yahoo` and `QUOTE_PROVIDER=yahoo` call unofficial Yahoo Finance endpoints. Yahoo does not document a general-purpose public news API. Check the current terms, rate limits, and retention rules before enabling them.

## Run the API

```bash
set -a && source .env && set +a
pnpm dev:api
```

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process status, trading mode, and storage (`memory` or `postgres`). |
| `POST` | `/signals` | Body `{ "ticker": "NVDA" }`. Builds a signal and, when risk allows, a paper order. |
| `GET` | `/signals` | Lists stored signals. |
| `GET` | `/signals/:signalId` | Returns one signal. |
| `POST` | `/signals/:signalId/approval` | Body `{ "approval": "granted" }` or `{ "approval": "denied" }`. |
| `GET` | `/trades` | Lists paper orders. |
| `GET` | `/portfolios` | Cash, positions, and equity. |

Orders above `requireHumanApprovalAboveNotional` in `infrastructure/config/risk-policy.json` (2500 by default) return `PENDING_APPROVAL`. Approve them with `POST /signals/:signalId/approval`.

## News ingestion

One cycle, using the tickers in `infrastructure/config/tickers.json`:

```bash
set -a && source .env && set +a
pnpm ingest:once
```

That command does not need Redis. It fetches, normalises, deduplicates, embeds, and stores articles. It publishes `news.updated` on the in-memory bus inside this process and does not call an agent. With `DATABASE_URL` set, the articles and embeddings are written to Postgres.

The repeating worker needs Redis. Start Redis, set `REDIS_HOST` and `REDIS_PORT`, then run the worker with no `--once` flag. The npm script always passes `--once`; start the scheduler directly:

```bash
pnpm exec tsx apps/news-ingestion/src/worker.ts
```

It enqueues a BullMQ job every five minutes for the tickers in `infrastructure/config/tickers.json`.

## Optional infrastructure

Postgres with pgvector, and Redis:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

In `.env`, uncomment:

```bash
DATABASE_URL=postgres://platform:platform@localhost:5432/platform
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Load that file, then start `pnpm dev:api`. Articles, signals, orders, and embeddings are stored in Postgres. The vector index is pgvector. Without `DATABASE_URL`, the same interfaces run in memory and the data disappears when the process exits.

`pnpm reconcile` compares the ledger with the paper broker's order list.

## News assessment

The default assessor is a local lexicon. It needs no model server. The model, when one is used, may return sentiment, materiality, and a summary. It does not choose the price, quantity, or order action. Zod checks the model output, and a failed call falls back to the lexicon.

To score with OpenAI, set `ANALYST_PROVIDER=openai` and `OPENAI_API_KEY`.

SGLang is used only when `ANALYST_PROVIDER=sglang` and `nvidia-smi` lists an NVIDIA GPU. With no NVIDIA GPU, assessment stays on the lexicon. On a GPU host:

```bash
docker compose --profile sglang \
  -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.gpu.yml up sglang
```

The server listens on port 30000. `SGLANG_BASE_URL` defaults to `http://127.0.0.1:30000/v1` and `SGLANG_MODEL` defaults to `Qwen/Qwen2.5-1.5B-Instruct`.

## Graphs

`langgraph.json` registers the graphs that the demo and `POST /signals` run:

- `research_agent` retrieves indexed news and emits a signal. It cannot submit an order.
- `execution_agent` validates the signal, runs the risk engine, and simulates a fill.
- `trading_orchestrator` runs research, then execution, and persists the result.

## Flow

Inside one process, which is what `pnpm demo` does:

1. News ingestion fetches, normalises, deduplicates, embeds, and stores articles.
2. It publishes `news.updated` on that process's event bus. It does not call an agent.
3. The demo's subscriber asks the trading orchestrator for a `BUY`, `SELL_LONG`, `SELL_SHORT`, or `HOLD` signal.
4. Target prices come from the current quote and the `news-momentum-v1` strategy.
5. The execution agent validates the signal, runs the risk engine, and requests approval when the notional is above the policy threshold.
6. An approved order is a paper fill. The idempotency key is the signal id.

Across processes, ingestion stops at the database write. The same steps from 3 onward run when `POST /signals` invokes the orchestrator in the API process, reading the rows ingestion stored.

`SELL_LONG` closes a long position. `SELL_SHORT` opens a short. Shorts are off in the default policy.

## Layout

- `apps/news-ingestion` fetches and indexes news. With Redis, the long-running worker repeats that every five minutes and, when `DATABASE_URL` is set, writes pgvector embeddings.
- `apps/trade-executor` reconciles the ledger with the paper broker. The execution agent, running inside the demo or the API, submits the paper order.
- `apps/api-gateway` is the HTTP server. It exposes `/signals`, `/trades`, and `/portfolios`, and it runs the orchestrator in-process.
- `apps/agent-server` re-exports the three LangGraph graphs for `langgraph.json`. This repo does not start it as a server.
- `agents/research-agent`, `agents/execution-agent`, and `agents/supervisor` are those graphs.
- `packages/risk` is the deterministic limit check. Model output cannot override it.
- `packages/contracts` is the shared signal, news, and order schema.
- `packages/vector-store` is the article index: pgvector when `DATABASE_URL` is set, and an in-memory index otherwise.
- `infrastructure/docker` runs PostgreSQL with pgvector, plus Redis. The SGLang service is behind the `sglang` profile.

Signals, orders, articles, and embeddings are business records. LangGraph checkpoints stay in the separate `langgraph` schema.

## Checks

```bash
pnpm test
pnpm typecheck
```

`pnpm test` runs the unit tests. `pnpm test:int` runs the integration tests. `pnpm test:all` runs both, plus lint and format checks.

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
