# Farming Labs ORM

Schema-first toolkit for defining data models once in TypeScript, generating **Prisma**, **Drizzle**, and **safe SQL** artifacts, and driving one typed runtime API across **memory**, **direct SQL**, and **Mongoose** backends. Built for libraries and internal platforms that want one contract across many persistence stacks.

## What you get

- **Schema DSL** — Models, fields (ids, strings, booleans, datetimes, etc.), defaults, uniqueness, column mapping, and relations (`hasMany`, `hasOne`, `belongsTo`) in a single TypeScript surface.
- **Generators** — Turn the same schema into Prisma schema files, Drizzle table definitions, or dialect-specific SQL migrations/DDL, driven by a small config file.
- **`farm-orm` CLI** — Load `farm-orm.config.ts`, merge multiple schema modules, and write each configured target to disk (`generate prisma | drizzle | sql`).
- **Runtime (today)** — Typed drivers for **memory**, **SQLite / MySQL / PostgreSQL** through `@farming-labs/orm-sql`, and **MongoDB / Mongoose** through `@farming-labs/orm-mongoose`.

## Monorepo layout

| Path                | Role                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/orm`      | Core: schema builders, relations, generators, manifest helpers, and the in-memory ORM driver.                 |
| `packages/cli`      | `farm-orm` binary: config loading, schema merging, and generator orchestration.                               |
| `packages/sql`      | Live SQL runtime driver for SQLite, MySQL, PostgreSQL pools, and PostgreSQL clients.                          |
| `packages/mongoose` | Live MongoDB runtime driver for Mongoose-backed apps.                                                         |
| `apps/demo`         | Example auth-shaped schema plus `farm-orm.config.ts` and generated samples.                                   |
| `apps/docs`         | Next.js site: landing page and MDX docs (getting started, schema, runtime, integrations, CLI, and use cases). |

Root **e2e** tests under `tests/` exercise a full workspace flow (build, generate, validate).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (CI uses 22)
- [pnpm](https://pnpm.io/) 10 (`packageManager` is pinned in the root `package.json`)

## Getting started

Clone the repo, install, and build all packages:

```bash
pnpm install
pnpm build
```

Run checks used in development:

```bash
pnpm check    # lint + format check + typecheck
pnpm test     # workspace tests + root e2e
```

### Local database integration tests

There is also a separate local integration lane for real databases. It is not
part of the default CI test suite.

```bash
pnpm test:local
pnpm test:local:sqlite
pnpm test:local:postgres
pnpm test:local:mysql
pnpm test:local:mongodb
```

See [LOCAL_DATABASE_TESTS.md](./LOCAL_DATABASE_TESTS.md) for install
steps, default connection URLs, and notes about MongoDB transaction support.

### Docs site locally

```bash
pnpm dev:docs
```

### Demo app (Vitest + example schema)

```bash
pnpm dev:demo
```

## CLI: generate from a config

From `apps/demo` (after `pnpm build` so `dist` exists), you can run the CLI via the workspace package:

```bash
cd apps/demo
pnpm exec farm-orm generate prisma  -c ./farm-orm.config.ts
pnpm exec farm-orm generate drizzle -c ./farm-orm.config.ts
pnpm exec farm-orm generate sql     -c ./farm-orm.config.ts
```

Or invoke the built binary directly:

```bash
node ../../packages/cli/dist/bin.js generate prisma -c ./farm-orm.config.ts
```

`farm-orm.config.ts` lists `schemas` (exported `defineSchema(...)` values) and `targets` with `out` paths and dialect/provider options. See `apps/demo/farm-orm.config.ts` for a full example.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on pushes to `main` / `master` and on **pull requests**: install with a frozen lockfile, then **lint**, **format check**, **typecheck**, and **test**.

## Contributing

Use `pnpm lint:fix` and `pnpm fmt` before opening a PR if you change formatting or want auto-fixable lint updates.
