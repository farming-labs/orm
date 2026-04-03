import { afterEach, describe, expect, it } from "vitest";
import { createOrm, detectDatabaseRuntime, isOrmError } from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase } from "@farming-labs/orm-runtime/setup";
import type { Neo4jDriverConfig } from "../src";
import type { RuntimeOrm } from "../../mongoose/test/support/auth";
import {
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertEnumBigintAndDecimalQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  schema,
} from "../../mongoose/test/support/auth";
import { createNeo4jDriver } from "../src";
import {
  cleanupNeo4jBase,
  createRealNeo4jBase,
  createRealNeo4jDriver,
  shouldRunRealNeo4jTests,
} from "./support/real-neo4j";

const itIfReal = shouldRunRealNeo4jTests() ? it : it.skip;
const REAL_NEO4J_TIMEOUT_MS = 90_000;
const pendingCleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (pendingCleanups.length) {
    const cleanup = pendingCleanups.pop()!;
    await cleanup();
  }
});

async function createRealNeo4jOrm() {
  const { driver, config } = await createRealNeo4jDriver();
  const base = createRealNeo4jBase();

  pendingCleanups.push(async () => {
    await cleanupNeo4jBase(driver, base, config.database);
    await driver.close();
  });

  return {
    driver,
    config,
    base,
    orm: createOrm({
      schema,
      driver: createNeo4jDriver({
        client: driver as Neo4jDriverConfig<typeof schema>["client"],
        base,
        database: config.database,
      }),
    }) as RuntimeOrm,
  };
}

describe.sequential("neo4j real integration", () => {
  itIfReal(
    "detects and bootstraps a real Neo4j driver",
    async () => {
      const { driver, config } = await createRealNeo4jDriver();
      const base = createRealNeo4jBase();

      pendingCleanups.push(async () => {
        await cleanupNeo4jBase(driver, base, config.database);
        await driver.close();
      });

      const detected = detectDatabaseRuntime(driver);
      const orm = (await bootstrapDatabase({
        schema,
        client: driver,
        neo4j: {
          base,
          database: config.database,
        },
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "real-neo4j@farminglabs.dev",
          name: "Real Neo4j",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(detected?.kind).toBe("neo4j");
      expect(created).toEqual({
        id: expect.any(String),
        email: "real-neo4j@farminglabs.dev",
      });
    },
    REAL_NEO4J_TIMEOUT_MS,
  );

  itIfReal(
    "creates an ORM directly from a real Neo4j driver",
    async () => {
      const { driver, config } = await createRealNeo4jDriver();
      const base = createRealNeo4jBase();

      pendingCleanups.push(async () => {
        await cleanupNeo4jBase(driver, base, config.database);
        await driver.close();
      });

      const orm = (await createOrmFromRuntime({
        schema,
        client: driver,
        neo4j: {
          base,
          database: config.database,
        },
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "runtime-real-neo4j@farminglabs.dev",
          name: "Runtime Real",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "runtime-real-neo4j@farminglabs.dev",
      });
    },
    REAL_NEO4J_TIMEOUT_MS,
  );

  itIfReal(
    "supports auth-style relation reads against a real Neo4j backend",
    async () => {
      const oneToOneOrm = (await createRealNeo4jOrm()).orm;
      await assertOneToOneAndHasManyQueries(oneToOneOrm, expect);

      const relationOrm = (await createRealNeo4jOrm()).orm;
      await assertBelongsToAndManyToManyQueries(relationOrm, expect);
    },
    REAL_NEO4J_TIMEOUT_MS,
  );

  itIfReal(
    "supports mutations, upserts, and compound uniques against a real Neo4j backend",
    async () => {
      const mutationOrm = (await createRealNeo4jOrm()).orm;
      await assertMutationQueries(mutationOrm, expect, {
        expectTransactionRollback: true,
      });

      const compoundUniqueOrm = (await createRealNeo4jOrm()).orm;
      await assertCompoundUniqueQueries(compoundUniqueOrm, expect);
    },
    REAL_NEO4J_TIMEOUT_MS,
  );

  itIfReal(
    "supports scalar coverage against a real Neo4j backend",
    async () => {
      const integerJsonOrm = (await createRealNeo4jOrm()).orm;
      await assertIntegerAndJsonQueries(integerJsonOrm, expect);

      const scalarOrm = (await createRealNeo4jOrm()).orm;
      await assertEnumBigintAndDecimalQueries(scalarOrm, expect);
    },
    REAL_NEO4J_TIMEOUT_MS,
  );

  itIfReal(
    "enforces model-level unique constraints against a real Neo4j backend",
    async () => {
      const { orm } = await createRealNeo4jOrm();
      await assertModelLevelConstraints(orm, expect);
    },
    REAL_NEO4J_TIMEOUT_MS,
  );

  itIfReal(
    "normalizes duplicate-key errors against a real Neo4j backend",
    async () => {
      const { orm } = await createRealNeo4jOrm();

      await orm.user.create({
        data: {
          email: "duplicate-real-neo4j@farminglabs.dev",
          name: "First",
        },
      });

      const error = await orm.user
        .create({
          data: {
            email: "duplicate-real-neo4j@farminglabs.dev",
            name: "Second",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("neo4j");
    },
    REAL_NEO4J_TIMEOUT_MS,
  );
});
