# AGENT

This repository is a TypeScript monorepo for Farming Labs ORM.

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
pnpm test:local:drizzle
pnpm test:local:kysely
pnpm test:local:mongodb
pnpm test:local:prisma
```

## Release flow

```bash
pnpm release:latest
```

Beta:

```bash
pnpm release:beta
pnpm publish:beta
```

## Notes

- `orm.$driver` exposes the attached runtime handle and the underlying instance.
- Real local integration tests are expected to use actual local database
  services where available.
- Docs live under `apps/docs/app/docs`.
