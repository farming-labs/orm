# @farming-labs/orm

One schema. Many stacks.

`@farming-labs/orm` lets you write your schema and storage layer once, then
translate it across Prisma, Drizzle, Kysely, MikroORM, TypeORM, Sequelize,
EdgeDB / Gel, Neo4j, SurrealDB, Cloudflare D1, Cloudflare KV, Redis / Upstash Redis,
Supabase JS, Xata, direct SQL, Firestore, DynamoDB, Unstorage, MongoDB, and
Mongoose.

It gives you:

- one schema definition in TypeScript
- one typed query API
- generated Prisma, Drizzle, and safe SQL artifacts
- runtime helpers that accept raw clients and build the ORM for you

## Packages

- `@farming-labs/orm`
  Core schema DSL, typed client, generators, and memory driver
- `@farming-labs/orm-cli`
  CLI for generating Prisma, Drizzle, and SQL artifacts
- `@farming-labs/orm-runtime`
  Helpers for detecting a raw client and creating a driver or ORM from it
- `@farming-labs/orm-prisma`
  Prisma runtime driver
- `@farming-labs/orm-drizzle`
  Drizzle runtime driver
- `@farming-labs/orm-kysely`
  Kysely runtime driver
- `@farming-labs/orm-mikroorm`
  MikroORM runtime driver
- `@farming-labs/orm-typeorm`
  TypeORM runtime driver
- `@farming-labs/orm-sequelize`
  Sequelize runtime driver
- `@farming-labs/orm-edgedb`
  EdgeDB / Gel SQL runtime driver
- `@farming-labs/orm-neo4j`
  Neo4j graph runtime driver
- `@farming-labs/orm-surrealdb`
  SurrealDB multi-model runtime driver
- `@farming-labs/orm-d1`
  Cloudflare D1 runtime driver
- `@farming-labs/orm-kv`
  Cloudflare KV runtime driver
- `@farming-labs/orm-redis`
  Redis and Upstash-compatible runtime driver
- `@farming-labs/orm-supabase`
  Supabase JS runtime driver
- `@farming-labs/orm-xata`
  Xata runtime driver
- `@farming-labs/orm-sql`
  Direct SQL runtime driver
- `@farming-labs/orm-firestore`
  Server-side Firestore runtime driver
- `@farming-labs/orm-dynamodb`
  DynamoDB runtime driver
- `@farming-labs/orm-unstorage`
  Unstorage runtime driver for lightweight key-value/document storage
- `@farming-labs/orm-mongo`
  Native MongoDB runtime driver
- `@farming-labs/orm-mongoose`
  Mongoose runtime driver

## Example

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
```

## Runtime Helpers

If you already have a raw runtime client, let the helper package detect it and
build the ORM:

```ts
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { Pool } from "pg";

const orm = await createOrmFromRuntime({
  schema,
  client: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
});

orm.$driver.kind; // "sql"
orm.$driver.capabilities.supportsTransactions; // true
```

You can also inspect a client before building anything:

```ts
import { inspectDatabaseRuntime } from "@farming-labs/orm";

const report = inspectDatabaseRuntime(client);

report.runtime;
report.summary;
```

Cloudflare Worker bindings work through the same helper path too:

```ts
const orm = await createOrmFromRuntime({
  schema,
  client: env.DB,
});

orm.$driver.kind; // "d1"
```

## Generate Artifacts

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

## Docs

The full guides live in the docs app under [`apps/docs`](/Users/mac/oss/orms/apps/docs).
