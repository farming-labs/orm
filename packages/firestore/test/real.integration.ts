import { afterEach, describe, expect, it } from "vitest";
import { createOrm, detectDatabaseRuntime, isOrmError } from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase } from "@farming-labs/orm-runtime/setup";
import { createFirestoreDriver } from "../src";
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
import {
  cleanupPrefixedCollections,
  createPrefixedCollections,
  createRealFirestoreClient,
  shouldRunRealFirestoreTests,
} from "./support/real-firestore";

const itIfReal = shouldRunRealFirestoreTests() ? it : it.skip;
const REAL_FIRESTORE_TIMEOUT_MS = 90_000;
const pendingCleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (pendingCleanups.length) {
    const cleanup = pendingCleanups.pop()!;
    await cleanup();
  }
});

async function createRealFirestoreOrm() {
  const db = await createRealFirestoreClient();
  const collections = createPrefixedCollections(db, schema);

  pendingCleanups.push(async () => {
    await cleanupPrefixedCollections(collections);
  });

  return {
    db,
    collections,
    orm: createOrm({
      schema,
      driver: createFirestoreDriver({
        db,
        collections,
      }),
    }) as RuntimeOrm,
  };
}

describe.sequential("firestore real integration", () => {
  itIfReal(
    "detects and bootstraps a real Firestore client",
    async () => {
      const { db, collections } = await createRealFirestoreOrm();

      const detected = detectDatabaseRuntime(db);
      const orm = (await bootstrapDatabase({
        schema,
        client: db,
        firestore: {
          collections,
        },
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "real-firestore@farminglabs.dev",
          name: "Real Firestore",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(detected?.kind).toBe("firestore");
      expect(created).toEqual({
        id: expect.any(String),
        email: "real-firestore@farminglabs.dev",
      });
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );

  itIfReal(
    "creates an ORM directly from a real Firestore client",
    async () => {
      const { db, collections } = await createRealFirestoreOrm();

      const orm = (await createOrmFromRuntime({
        schema,
        client: db,
        firestore: {
          collections,
        },
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "runtime-real@farminglabs.dev",
          name: "Runtime Real",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "runtime-real@farminglabs.dev",
      });
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );

  itIfReal(
    "supports auth-style relation reads against a real Firestore backend",
    async () => {
      const oneToOneOrm = (await createRealFirestoreOrm()).orm;
      await assertOneToOneAndHasManyQueries(oneToOneOrm, expect);

      const relationOrm = (await createRealFirestoreOrm()).orm;
      await assertBelongsToAndManyToManyQueries(relationOrm, expect);
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );

  itIfReal(
    "supports mutations, upserts, and compound uniques against a real Firestore backend",
    async () => {
      const mutationOrm = (await createRealFirestoreOrm()).orm;
      await assertMutationQueries(mutationOrm, expect);

      const compoundUniqueOrm = (await createRealFirestoreOrm()).orm;
      await assertCompoundUniqueQueries(compoundUniqueOrm, expect);
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );

  itIfReal(
    "supports scalar coverage against a real Firestore backend",
    async () => {
      const integerJsonOrm = (await createRealFirestoreOrm()).orm;
      await assertIntegerAndJsonQueries(integerJsonOrm, expect);

      const scalarOrm = (await createRealFirestoreOrm()).orm;
      await assertEnumBigintAndDecimalQueries(scalarOrm, expect);
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );

  itIfReal(
    "enforces model-level unique constraints against a real Firestore backend",
    async () => {
      const { orm } = await createRealFirestoreOrm();
      await assertModelLevelConstraints(orm, expect);
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );

  itIfReal(
    "normalizes duplicate-key errors against a real Firestore backend",
    async () => {
      const { orm } = await createRealFirestoreOrm();

      await orm.user.create({
        data: {
          email: "duplicate-real@farminglabs.dev",
          name: "First",
        },
      });

      const error = await orm.user
        .create({
          data: {
            email: "duplicate-real@farminglabs.dev",
            name: "Second",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("firestore");
    },
    REAL_FIRESTORE_TIMEOUT_MS,
  );
});
