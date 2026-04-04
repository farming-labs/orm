# AGENT

This repository is a TypeScript monorepo for @farming-labs/orm

## What this repo contains

- `packages/orm`
  Core schema DSL, generators, manifest logic, memory runtime, and `createOrm`
- `packages/sql`
  Direct SQL runtime for SQLite, MySQL, and PostgreSQL
- `packages/prisma`
  Prisma runtime driver
- `packages/drizzle`
  Drizzle runtime driver
- `packages/kysely`
  Kysely runtime driver
- `packages/mikroorm`
  MikroORM runtime driver
- `packages/typeorm`
  TypeORM runtime driver
- `packages/sequelize`
  Sequelize runtime driver
- `packages/edgedb`
  EdgeDB / Gel SQL runtime driver
- `packages/neo4j`
  Neo4j graph runtime driver
- `packages/d1`
  Cloudflare D1 runtime driver
- `packages/kv`
  Cloudflare KV runtime driver
- `packages/redis`
  Redis and Upstash-compatible runtime driver
- `packages/supabase`
  Supabase JS runtime driver alongside the raw PostgreSQL Supabase helpers in `packages/sql`
- `packages/xata`
  Xata runtime driver
- `packages/firestore`
  Firestore runtime driver
- `packages/dynamodb`
  DynamoDB runtime driver
- `packages/unstorage`
  Unstorage runtime driver for lightweight key-value/document storage
- `packages/mongo`
  Native MongoDB runtime driver
- `packages/mongoose`
  Mongoose runtime driver
- `apps/docs`
  Documentation site
- `apps/demo`
  Demo app and runtime swap examples

## Working conventions

1. Keep public library logic backend-agnostic.
   New library-facing features should work through `createOrm(...)`, not require
   direct Prisma, Drizzle, SQL, or Mongo calls in app code.

2. Keep schema metadata authoritative.
   Relations, constraints, field mappings, and generators should stay aligned
   with the schema DSL.

3. When runtime behavior changes, update tests at both levels.
   - fast tests for local logic
   - real `local.integration.ts` tests for backend behavior

4. Keep docs and README current with shipped behavior.

## Useful commands

```bash
pnpm typecheck
pnpm test
pnpm test:local
pnpm format:check
```

Targeted local suites:

```bash
pnpm test:local:sql
pnpm test:local:d1
pnpm test:local:kv
pnpm test:local:edgedb
pnpm test:local:neo4j
pnpm test:local:drizzle
pnpm test:local:kysely
pnpm test:local:mikroorm
pnpm test:local:sequelize
pnpm test:local:typeorm
pnpm test:local:dynamodb
pnpm test:local:redis
pnpm test:local:supabase
pnpm test:local:xata
pnpm test:local:unstorage
pnpm test:local:mongodb
pnpm test:local:prisma
pnpm test:xata:real
```

## Release flow

```bash
pnpm release:latest
```

That is the full stable release flow now: recursively bump workspace package
manifests, commit, tag, and publish.

Beta:

```bash
pnpm release:beta
```

## Notes

- `orm.$driver` exposes the attached runtime handle and the underlying instance.
- Real local integration tests are expected to use actual local database
  services where available.
- Cloudflare D1 is supported as a worker-native runtime. Use the runtime path in
  Workers, and keep `@farming-labs/orm-runtime/setup` for local, CI, or other
  Node-managed bootstrap flows.
- Cloudflare KV is supported as a worker-native key-value runtime. Use the
  runtime path in Workers, and treat `pushSchema(...)` / `applySchema(...)` as
  intentional no-ops.
- EdgeDB / Gel is supported as a runtime-first SQL bridge through the Gel SQL
  client. Use the runtime path for query execution, and keep schema management
  in the app's own Gel migration or SQL workflow.
- Neo4j is supported as a runtime-first graph backend through the official
  Neo4j driver or session shapes. It keeps one schema and one ORM surface, but
  relation loading stays conservative instead of becoming a Cypher-native graph
  query builder.
- Redis support covers both Redis and Upstash-compatible clients through one
  key-value runtime family. It is a good fit for sessions, tokens, cache
  metadata, and rate limits, not highly relational or join-heavy workloads.
- Supabase support now covers both direct Supabase JS clients and raw
  PostgreSQL clients connected to Supabase.
- Xata is supported as a runtime-first SQL-backed client integration. It keeps
  one schema and one setup path, but its transaction semantics stay
  conservative instead of claiming long-lived interactive rollback behavior.
  There is also an opt-in `pnpm test:xata:real` path for verifying against a
  real Xata project.
- Unstorage is supported as a lightweight key-value/document runtime, but it is
  not the preferred fit for highly relational or join-heavy workloads.
- Docs live under `apps/docs/app/docs`.
