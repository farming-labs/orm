# @farming-labs/orm

One schema. Many stacks.

`@farming-labs/orm` lets library authors and shared platform packages define a data
model once in TypeScript, then:

- generate Prisma, Drizzle, and SQL output
- run one typed query API against memory, Prisma, Drizzle, SQL, MongoDB, or Mongoose
- keep app code independent from the consumer's ORM choice

## What it is

- `@farming-labs/orm`
  Core schema DSL, typed client, generators, and memory runtime
- `@farming-labs/orm-cli`
  `farm-orm` CLI for generating Prisma, Drizzle, and SQL artifacts
- `@farming-labs/orm-prisma`
  Live runtime driver for apps that already use `PrismaClient`
- `@farming-labs/orm-drizzle`
  Live runtime driver for apps that already use Drizzle database instances
- `@farming-labs/orm-sql`
  Live runtime driver for SQLite, MySQL, and PostgreSQL
- `@farming-labs/orm-mongo`
  Live runtime driver for MongoDB apps that use the native `mongodb` client
- `@farming-labs/orm-mongoose`
  Live runtime driver for MongoDB apps that use Mongoose

## What works today

- schema definition with fields, defaults, uniqueness, mapped column names, and relations
- generated Prisma output
- generated Drizzle output
- generated safe SQL output
- live runtime queries for:
  - memory
  - Prisma through `PrismaClient`
  - Drizzle through Drizzle database instances backed by SQLite, MySQL, or PostgreSQL
  - SQLite
  - MySQL
  - PostgreSQL
  - MongoDB through the native `mongodb` driver
  - MongoDB through Mongoose
- relation support for:
  - `belongsTo`
  - `hasOne`
  - `hasMany`
  - explicit join-table `manyToMany`

## What does not exist yet

- live Kysely runtime driver

## Simple example

```ts
import { belongsTo, createOrm, defineSchema, hasMany, id, model, string } from "@farming-labs/orm";
import { createPgPoolDriver } from "@farming-labs/orm-sql";
import { Pool } from "pg";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
    },
    relations: {
      sessions: hasMany("session", { foreignKey: "userId" }),
    },
  }),
  session: model({
    table: "sessions",
    fields: {
      id: id(),
      userId: string().references("user.id"),
      token: string().unique(),
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
    },
  }),
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const orm = createOrm({
  schema,
  driver: createPgPoolDriver(pool),
});

const user = await orm.user.findOne({
  where: { email: "ada@farminglabs.dev" },
  select: {
    id: true,
    email: true,
    sessions: {
      select: {
        token: true,
      },
    },
  },
});
```

## Generate artifacts

Define a `farm-orm.config.ts`:

```ts
import { defineConfig } from "@farming-labs/orm-cli";
import { schema } from "./src/schema";

export default defineConfig({
  schemas: [schema],
  targets: {
    prisma: {
      out: "./generated/prisma/schema.prisma",
      provider: "postgresql",
    },
    drizzle: {
      out: "./generated/drizzle/schema.ts",
      dialect: "pg",
    },
    sql: {
      out: "./generated/sql/0001_init.sql",
      dialect: "postgres",
    },
  },
});
```

Then run:

```bash
farm-orm generate prisma
farm-orm generate drizzle
farm-orm generate sql
```

## Local development

Requirements:

- Node.js 20+
- pnpm 10

Install and build:

```bash
pnpm install
pnpm build
```

Common commands:

```bash
pnpm test
pnpm check
pnpm dev:docs
pnpm dev:demo
```

Real local database integration tests:

```bash
pnpm test:local
pnpm test:local:prisma
pnpm test:local:drizzle
pnpm test:local:sqlite
pnpm test:local:postgres
pnpm test:local:mysql
pnpm test:local:mongodb
```

Unified adapter-swap demo:

```bash
pnpm --filter demo demo -- all
pnpm --filter demo demo -- memory
pnpm --filter demo demo -- sqlite
pnpm --filter demo demo -- prisma
pnpm --filter demo demo -- mongo
pnpm --filter demo demo -- mongoose
```

Full local adapter matrix:

```bash
pnpm --filter demo test:local
```

## Releasing packages

Version and tag a release:

```bash
pnpm release:latest
```

Publish the latest version:

```bash
pnpm publish:latest
```

Beta flow:

```bash
pnpm release:beta
pnpm publish:beta
```

Dry runs:

```bash
pnpm publish:latest:dry-run
pnpm publish:beta:dry-run
```

## Repo layout

- `packages/orm`
- `packages/cli`
- `packages/prisma`
- `packages/drizzle`
- `packages/sql`
- `packages/mongoose`
- `apps/demo`
- `apps/docs`

## Docs

Run the docs site locally with:

```bash
pnpm dev:docs
```

The main docs live under [`apps/docs/app/docs`](/Users/mac/oss/orms/apps/docs/app/docs).
