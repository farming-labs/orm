# Local Database Integration Tests

These tests exercise the live runtime drivers against real local databases
instead of mocks, `pg-mem`, or fake Mongoose model layers.

They are intentionally separate from the default `pnpm test` flow so CI stays
fast and deterministic.

## What is covered

- SQLite via a real local file database
- PostgreSQL via `pg.Pool`
- PostgreSQL via a connected `pg` client
- MySQL via a real pool
- MySQL via a real connection
- MongoDB via Mongoose models and a local server

## Commands

From the repo root:

```bash
pnpm test:local
pnpm test:local:sqlite
pnpm test:local:postgres
pnpm test:local:mysql
pnpm test:local:mongodb
```

## Default local connection targets

If you do not set any env vars, the local tests assume:

```bash
FARM_ORM_LOCAL_PG_ADMIN_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
FARM_ORM_LOCAL_MYSQL_ADMIN_URL=mysql://root:root@127.0.0.1:3306
FARM_ORM_LOCAL_MONGODB_URL=mongodb://127.0.0.1:27017
```

The PostgreSQL and MySQL tests create throwaway databases automatically and
drop them after the run. You do not need to pre-create a test database.

SQLite uses a temporary local file and cleans it up automatically.

## Installing local services

Examples below assume Homebrew on macOS because that is the most likely local
developer path in this repo.

### PostgreSQL

```bash
brew install postgresql@17
brew services start postgresql@17
```

If you want the default test URL to work unchanged, create a `postgres` user
with password `postgres` or export your own `FARM_ORM_LOCAL_PG_ADMIN_URL`.

### MySQL

```bash
brew install mysql
brew services start mysql
```

If your local root password is not `root`, export your own
`FARM_ORM_LOCAL_MYSQL_ADMIN_URL`.

### MongoDB

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

If your MongoDB server is not at `mongodb://127.0.0.1:27017`, export your own
`FARM_ORM_LOCAL_MONGODB_URL`.

## MongoDB transaction note

The default MongoDB local integration test covers real CRUD and relation flows.

`orm.transaction(...)` against MongoDB is only safe to test when your local
MongoDB setup supports transactions, which usually means running a replica set.

If you do have that locally, you can opt into the extra transaction assertion:

```bash
FARM_ORM_LOCAL_MONGODB_TRANSACTIONS=1 pnpm test:local:mongodb
```

## Running a subset of the SQL matrix

The SQL local test file also supports an internal selector:

```bash
FARM_ORM_LOCAL_SQL_TARGETS=sqlite pnpm --filter @farming-labs/orm-sql test:local
FARM_ORM_LOCAL_SQL_TARGETS=postgres-pool,postgres-client pnpm --filter @farming-labs/orm-sql test:local
FARM_ORM_LOCAL_SQL_TARGETS=mysql-pool,mysql-connection pnpm --filter @farming-labs/orm-sql test:local
```

Supported values are:

- `sqlite`
- `postgres-pool`
- `postgres-client`
- `mysql-pool`
- `mysql-connection`
