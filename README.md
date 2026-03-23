# Farming Labs ORM

## Workspace

- `packages/orm` - core schema DSL, typed client surface, generators, and memory driver
- `packages/cli` - `farm-orm` CLI for Prisma, Drizzle, and safe SQL generation
- `apps/demo` - working auth-shaped schema and generated output example
- `apps/docs` - landing page and docs site for `docs.farming-labs.dev`

## Demo CLI

```bash
cd apps/demo
node ../../packages/cli/dist/bin.js generate prisma -c ./farm-orm.config.ts
node ../../packages/cli/dist/bin.js generate drizzle -c ./farm-orm.config.ts
node ../../packages/cli/dist/bin.js generate sql -c ./farm-orm.config.ts
```
