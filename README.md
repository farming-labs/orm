# @farming-labs/orm

One schema. Many stacks.

`@farming-labs/orm` lets you define a schema once in TypeScript, generate
Prisma/Drizzle/SQL output from it, and run one typed query API across multiple
runtime drivers.

If an app already uses Prisma, Drizzle, Kysely, direct SQL, MongoDB, or
Mongoose, the matching runtime package lets shared libraries keep one storage
layer while the app keeps its own database stack.

## Packages

- `@farming-labs/orm`
  Core schema DSL, typed client, generators, and memory driver
- `@farming-labs/orm-cli`
  CLI for generating Prisma, Drizzle, and safe SQL artifacts
- `@farming-labs/orm-prisma`
  Runtime driver for `PrismaClient`
- `@farming-labs/orm-drizzle`
  Runtime driver for Drizzle-backed SQLite, MySQL, and PostgreSQL
- `@farming-labs/orm-kysely`
  Runtime driver for Kysely-backed SQLite, MySQL, and PostgreSQL
- `@farming-labs/orm-sql`
  Direct SQL runtime for SQLite, MySQL, and PostgreSQL
- `@farming-labs/orm-mongo`
  Runtime driver for the native `mongodb` client
- `@farming-labs/orm-mongoose`
  Runtime driver for Mongoose
- `@farming-labs/orm-runtime`
  Auto-detect helpers that build a driver or ORM from a raw runtime instance

## What works today

- schema definition with:
  - `id()`
  - `string()`
  - `boolean()`
  - `datetime()`
  - `integer()`
  - `json()`
  - `enumeration()`
  - `bigint()`
  - `decimal()`
  - defaults
  - field-level uniques
  - model-level compound uniques and indexes
  - mapped column names
  - relations
- generated Prisma output
- generated Drizzle output
- generated safe SQL output
- live runtime drivers for:
  - memory
  - Prisma
  - Drizzle
  - Kysely
  - SQLite
  - MySQL
  - PostgreSQL
  - MongoDB via `mongodb`
  - MongoDB via Mongoose
- relation support for:
  - `belongsTo`
  - `hasOne`
  - `hasMany`
  - explicit join-table `manyToMany`
- native relation translation for:
  - direct SQL, Drizzle, and Kysely on singular chains and simple collection branches
  - Prisma delegate translation for supported nested relation branches and simple explicit join-table traversal
- compound-unique runtime lookups and upserts
- integer comparison filters and raw JSON equality filters across the live runtimes
- enum, bigint, and decimal support across the live runtimes and generated outputs

## Quick example

```ts
import {
  belongsTo,
  createOrm,
  defineSchema,
  detectDatabaseRuntime,
  hasMany,
  id,
  model,
  string,
} from "@farming-labs/orm";
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

const orm = createOrm({
  schema,
  driver: createPgPoolDriver(
    new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  ),
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

orm.$driver.kind; // "sql"
orm.$driver.capabilities.supportsTransactions; // true
orm.$driver.capabilities.nativeRelationLoading; // "partial"
```

## Kysely runtime example

```ts
import { createOrm } from "@farming-labs/orm";
import { createKyselyDriver } from "@farming-labs/orm-kysely";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { schema } from "./schema";

const kysely = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

const orm = createOrm({
  schema,
  driver: createKyselyDriver({
    db: kysely,
    dialect: "postgres",
  }),
});
```

## Generate artifacts

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

```bash
farm-orm generate prisma
farm-orm generate drizzle
farm-orm generate sql
```

You can also inspect a raw client before building a driver:

```ts
import { detectDatabaseRuntime } from "@farming-labs/orm";
import { Pool } from "pg";

const detected = detectDatabaseRuntime(
  new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
);

detected?.kind; // "sql"
detected?.dialect; // "postgres"
```

Or let the helper package detect the runtime and build the ORM for you:

```ts
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { Pool } from "pg";

const orm = createOrmFromRuntime({
  schema,
  client: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
});

orm.$driver.kind; // "sql"
orm.$driver.dialect; // "postgres"
```

If you want only the driver, use the lower-level helper:

```ts
import { createDriverFromRuntime } from "@farming-labs/orm-runtime";

const driver = createDriverFromRuntime({
  schema,
  client: prisma,
});
```

The same package can also prepare the live database:

```ts
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime";

await pushSchema({
  schema,
  client: prisma,
});

const orm = await bootstrapDatabase({
  schema,
  client: prisma,
});
```

For SQL-family runtimes it applies generated DDL. For Prisma it runs a temporary
`prisma db push --skip-generate`. For MongoDB and Mongoose it ensures
collections and indexes from the schema manifest.

## Local development

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:docs
pnpm dev:demo
```

`pnpm test` already includes the real integration matrix. Use these when you
want to rerun the database-backed suites directly:

```bash
pnpm test:local
pnpm test:local:prisma
pnpm test:local:kysely
pnpm test:local:drizzle
pnpm test:local:sqlite
pnpm test:local:postgres
pnpm test:local:mysql
pnpm test:local:mongodb
```

That local matrix now includes real coverage for:

- `integer()` fields
- `json()` fields
- `enumeration()` fields
- `bigint()` fields
- `decimal()` fields
- compound-unique lookups and upserts
- relation traversal and mutation flows

across Prisma, Drizzle, Kysely, direct SQL, MongoDB, and Mongoose.

For SQLite bigint coverage, the local matrix enables the underlying
`node:sqlite` big-int read mode so values stay as real `bigint` outputs.

Demo:

```bash
pnpm --filter demo demo -- all
pnpm --filter demo demo -- memory
pnpm --filter demo demo -- prisma
pnpm --filter demo demo -- mongo
pnpm --filter demo demo -- mongoose
```

## Release

```bash
pnpm release:latest
```
