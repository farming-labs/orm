---
name: farming-labs-orm
description: |
  Use when working in the Farming Labs ORM monorepo. Covers the schema DSL,
  runtime drivers, relation translation, docs updates, release flow, and real
  local database integration tests. Triggers: createOrm, Prisma driver,
  Drizzle driver, Kysely driver, Mongo runtime, Mongoose runtime, update docs,
  test:local, release latest, compound unique, native relation loading.
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
pnpm test:local:drizzle
pnpm test:local:kysely
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
