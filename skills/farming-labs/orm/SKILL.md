---
name: farming-labs-orm
description: |
  Use when working in the Farming Labs ORM monorepo. Covers the schema DSL,
  runtime drivers, relation translation, docs updates, release flow, and real
  local database integration tests. Triggers: createOrm, Prisma driver,
  Drizzle driver, Kysely driver, MikroORM driver, TypeORM driver, Sequelize driver, Cloudflare D1,
  Cloudflare KV, Redis, Supabase JS, EdgeDB, Firestore, DynamoDB, Unstorage, Mongo runtime,
  Mongoose runtime, update docs, test:local, release latest, compound unique,
  native relation loading.
---

# Farming Labs ORM

Use this skill when the task is inside the Farming Labs ORM repository or needs
repo-specific knowledge about the unified ORM API.

## Repo map

- `packages/orm`
  Core schema DSL, manifest, generators, memory runtime, and `createOrm(...)`
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
- `packages/d1`
  Cloudflare D1 runtime driver
- `packages/kv`
  Cloudflare KV runtime driver
- `packages/redis`
  Redis and Upstash-compatible runtime driver
- `packages/supabase`
  Supabase JS runtime driver
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
  Swap-style demo app that exercises multiple runtimes

## Core expectations

1. Keep the unified API portable.
   Library-facing code should go through `createOrm(...)`, not backend-specific
   query APIs.

2. Preserve the schema as the source of truth.
   Relations, mapped column names, constraints, and generated artifacts should
   derive from the schema DSL.

3. Prefer real integration coverage when backend behavior changes.
   If runtime semantics change, add or update the relevant
   `local.integration.ts` suite. SQL, Prisma, Drizzle, Kysely, MongoDB, and
   Mongoose no longer keep separate fake runtime test layers.

4. Keep docs aligned with shipped behavior.
   If runtime support, query semantics, or release flow changes, update
   `apps/docs` and `README.md` in the same change.

## Runtime conventions

- `orm.$driver` exposes the attached runtime handle.
- `orm.$driver.kind` identifies the backend family.
- `orm.$driver.client` is the original high-level instance passed into the
  driver where possible.
- Transaction-scoped ORM instances should preserve the same driver handle shape.

## Testing workflow

Start with:

```bash
pnpm typecheck
pnpm test
```

`pnpm test` already includes the real backend matrix. Use these when you want
to rerun specific local suites:

```bash
pnpm test:local
```

Targeted commands:

```bash
pnpm test:local:sql
pnpm test:local:d1
pnpm test:local:kv
pnpm test:local:edgedb
pnpm test:local:drizzle
pnpm test:local:kysely
pnpm test:local:mikroorm
pnpm test:local:sequelize
pnpm test:local:typeorm
pnpm test:local:dynamodb
pnpm test:local:redis
pnpm test:local:supabase
pnpm test:local:unstorage
pnpm test:local:mongodb
pnpm test:local:prisma
```

Use the package-local test files to find coverage:

- `packages/*/test/local.integration.ts`
- `packages/orm/test/core.test.ts`
- `packages/orm/test/runtime.test.ts`

## Docs workflow

Main docs pages to keep in sync:

- `apps/docs/app/docs/runtime/page.mdx`
- `apps/docs/app/docs/integrations/*.mdx`
- `apps/docs/app/docs/schema/*.mdx`
- `README.md`

After docs changes:

```bash
pnpm --filter docs test
```

## Release workflow

Current release flow:

```bash
pnpm release:latest
```

That command now runs the full stable release flow, including npm publish.
`bump.config.ts` uses the workspace-recursive release flow.

The release files, commit message, and tag pattern are configured in
`bump.config.ts`.

Beta flow:

```bash
pnpm release:beta
```

## Runtime matrix

Current runtime packages in this repo:

- `@farming-labs/orm`
  - memory runtime
- `@farming-labs/orm-sql`
  - SQLite
  - MySQL
  - PostgreSQL
- `@farming-labs/orm-prisma`
  - real PrismaClient-backed runtime
- `@farming-labs/orm-drizzle`
  - Drizzle-backed runtime using the SQL runtime underneath
- `@farming-labs/orm-kysely`
  - Kysely-backed runtime using the SQL runtime underneath
- `@farming-labs/orm-mikroorm`
  - MikroORM-backed runtime using the SQL runtime underneath
- `@farming-labs/orm-typeorm`
  - TypeORM runtime
- `@farming-labs/orm-sequelize`
  - Sequelize runtime
- `@farming-labs/orm-edgedb`
  - EdgeDB / Gel SQL runtime bridge
- `@farming-labs/orm-d1`
  - Cloudflare D1 runtime
- `@farming-labs/orm-kv`
  - Cloudflare KV runtime
- `@farming-labs/orm-redis`
  - Redis and Upstash-compatible key-value runtime
- `@farming-labs/orm-supabase`
  - direct Supabase JS runtime
- `@farming-labs/orm-firestore`
  - Firestore runtime
- `@farming-labs/orm-dynamodb`
  - DynamoDB runtime
- `@farming-labs/orm-unstorage`
  - lightweight key-value/document runtime
- `@farming-labs/orm-mongo`
  - native MongoDB runtime
- `@farming-labs/orm-mongoose`
  - Mongoose runtime

Current common features:

- compound unique lookups
- `integer()` and `json()`
- relation loading
- native relation translation for the SQL family and Prisma on supported shapes
- `orm.$driver` access to the attached runtime handle

Important boundary:

- `@farming-labs/orm-d1` is Worker-friendly at runtime, but
  `@farming-labs/orm-runtime/setup` is still for local, CI, or other
  Node-managed bootstrap flows.
- `@farming-labs/orm-kv` is a Worker-friendly Cloudflare key-value runtime for
  sessions, tokens, cache metadata, rate limits, and lightweight framework
  state. It is not the preferred fit for highly relational or join-heavy workloads.
- `@farming-labs/orm-edgedb` is a runtime-first bridge through the official Gel
  SQL client. It is meant for query execution on top of an existing Gel
  database, not for replacing the app's own Gel schema or migration workflow.
- `@farming-labs/orm-redis` is for Redis and Upstash-compatible key-value
  workloads such as sessions, cache metadata, tokens, and rate limits. It is
  not the preferred fit for highly relational or join-heavy workloads.
- `@farming-labs/orm-supabase` uses Supabase's own client API rather than a
  hidden raw `pg` bridge. It is query-first, keeps setup as a no-op, and is a
  good fit when the app already owns a `createClient(...)` instance.
- `@farming-labs/orm-unstorage` is meant for lightweight key-value/document
  storage and shared storage layers, not for highly relational or join-heavy
  workloads.
