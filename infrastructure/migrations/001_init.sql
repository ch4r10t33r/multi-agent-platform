-- Relational records, embeddings, and the trading ledger live in one Postgres
-- database. LangGraph checkpoints belong in the langgraph schema and are not
-- a substitute for the trading ledger.

create extension if not exists vector;
create extension if not exists pgcrypto;

create schema if not exists market;
create schema if not exists trading;
create schema if not exists ops;
create schema if not exists langgraph;

comment on schema langgraph is
  'Reserved for LangGraph Server checkpoints. Do not store orders or signals here.';

create table market.articles (
  article_id text primary key,
  canonical_url text not null unique,
  title text not null,
  summary text not null,
  source text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null,
  tickers text[] not null,
  payload jsonb not null
);

create index articles_tickers_idx on market.articles using gin (tickers);

-- 64 dimensions matches the local hash embedder and OpenAI requests that
-- ask for EMBEDDING_DIMENSIONS=64. A larger model needs a new migration.
create table market.article_embeddings (
  article_id text primary key references market.articles (article_id) on delete cascade,
  model text not null,
  embedding vector(64) not null,
  updated_at timestamptz not null default now()
);

create table market.ingestion_runs (
  run_id uuid primary key,
  tickers text[] not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  inserted_count integer not null default 0,
  status text not null check (status in ('running', 'completed', 'failed'))
);

create table trading.signals (
  signal_id uuid primary key,
  ticker text not null,
  action text not null check (action in ('BUY', 'SELL_LONG', 'SELL_SHORT', 'HOLD')),
  payload jsonb not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create index signals_ticker_idx on trading.signals (ticker, created_at desc);

create table trading.orders (
  order_id uuid primary key,
  idempotency_key text not null unique,
  signal_id uuid not null,
  ticker text not null,
  status text not null check (
    status in ('PENDING_APPROVAL', 'REJECTED', 'SUBMITTED', 'FILLED', 'CANCELLED', 'FAILED')
  ),
  payload jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table trading.accounts (
  account_id text primary key,
  cash numeric(18, 2) not null,
  currency text not null,
  realized_pnl_today numeric(18, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into trading.accounts (account_id, cash, currency, realized_pnl_today)
values ('primary', 100000, 'USD', 0);

create table trading.positions (
  ticker text primary key,
  quantity numeric(18, 4) not null,
  average_price numeric(18, 4) not null,
  updated_at timestamptz not null default now()
);

create table ops.audit_events (
  event_id uuid primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  attributes jsonb not null
);
