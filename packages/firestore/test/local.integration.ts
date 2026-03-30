import { describe, expect, it } from "vitest";
import {
  createOrm,
  defineSchema,
  detectDatabaseRuntime,
  id,
  inspectDatabaseRuntime,
  isOrmError,
  model,
  string,
  tableName,
} from "@farming-labs/orm";
import { bootstrapDatabase } from "@farming-labs/orm-runtime/setup";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { createFirestoreDriver } from "../src";
import { InMemoryFirestore } from "./support/firestore-harness";
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

const generatedNumericIdSchema = defineSchema({
  auditEvent: model({
    table: "audit_events",
    fields: {
      id: id({ type: "integer", generated: "increment" }),
      email: string().unique(),
    },
  }),
});

const namespacedSchema = defineSchema({
  user: model({
    table: tableName("users", { schema: "auth" }),
    fields: {
      id: id(),
      email: string().unique(),
    },
  }),
});

function createLocalFirestoreOrm() {
  const db = new InMemoryFirestore();

  return {
    db,
    orm: createOrm({
      schema,
      driver: createFirestoreDriver({
        db,
      }),
    }) as RuntimeOrm,
  };
}

describe("firestore local integration", () => {
  it("detects Firestore runtimes and creates an ORM from the raw client", async () => {
    const db = new InMemoryFirestore();

    const detected = detectDatabaseRuntime(db);
    const inspected = inspectDatabaseRuntime(db);
    const orm = (await createOrmFromRuntime({
      schema,
      client: db,
    })) as RuntimeOrm;

    expect(detected).toEqual({
      kind: "firestore",
      client: db,
      source: "db",
    });
    expect(inspected.runtime?.kind).toBe("firestore");
    expect(orm.$driver.kind).toBe("firestore");
    expect(orm.$driver.capabilities).toEqual({
      supportsNumericIds: true,
      numericIds: "manual",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsTransactions: true,
      supportsSchemaNamespaces: false,
      supportsTransactionalDDL: false,
      supportsJoin: false,
      nativeRelationLoading: "none",
      textComparison: "case-sensitive",
      textMatching: {
        equality: "case-sensitive",
        contains: "case-sensitive",
        ordering: "case-sensitive",
      },
      upsert: "native",
      returning: {
        create: true,
        update: true,
        delete: false,
      },
      returningMode: {
        create: "record",
        update: "record",
        delete: "none",
      },
      nativeRelations: {
        singularChains: false,
        hasMany: false,
        manyToMany: false,
        filtered: false,
        ordered: false,
        paginated: false,
      },
    });
  });

  it("bootstraps through the runtime setup helpers without requiring schema push", async () => {
    const db = new InMemoryFirestore();
    const orm = (await bootstrapDatabase({
      schema,
      client: db,
    })) as RuntimeOrm;

    const created = await orm.user.create({
      data: {
        email: "bootstrap@farminglabs.dev",
        name: "Bootstrap",
      },
      select: {
        id: true,
        email: true,
      },
    });

    expect(created).toEqual({
      id: expect.any(String),
      email: "bootstrap@farminglabs.dev",
    });
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertOneToOneAndHasManyQueries(orm, expect);
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertBelongsToAndManyToManyQueries(orm, expect);
  });

  it("runs mutation queries and transactional batches", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertMutationQueries(orm, expect);
  });

  it("supports compound unique lookups and upserts", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertCompoundUniqueQueries(orm, expect);
  });

  it("supports integer and json fields", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertIntegerAndJsonQueries(orm, expect);
  });

  it("supports enum, bigint, and decimal fields", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertEnumBigintAndDecimalQueries(orm, expect);
  });

  it("enforces model-level unique constraints", async () => {
    const { orm } = createLocalFirestoreOrm();
    await assertModelLevelConstraints(orm, expect);
  });

  it("normalizes duplicate key errors from Firestore writes", async () => {
    const { orm } = createLocalFirestoreOrm();

    await orm.user.create({
      data: {
        email: "duplicate@farminglabs.dev",
        name: "First",
      },
    });

    const error = await orm.user
      .create({
        data: {
          email: "duplicate@farminglabs.dev",
          name: "Second",
        },
      })
      .catch((reason) => reason);

    expect(isOrmError(error)).toBe(true);
    expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
    expect(error.backendKind).toBe("firestore");
  });

  it("rejects generated integer ids for Firestore", async () => {
    const db = new InMemoryFirestore();

    await expect(
      createOrm({
        schema: generatedNumericIdSchema,
        driver: createFirestoreDriver({
          db,
        }),
      }).auditEvent.create({
        data: {
          email: "generated@farminglabs.dev",
        },
      }),
    ).rejects.toThrow(/generated integer ids/i);
  });

  it("rejects schema-qualified tables for Firestore", async () => {
    const db = new InMemoryFirestore();

    await expect(
      createOrm({
        schema: namespacedSchema,
        driver: createFirestoreDriver({
          db,
        }),
      }).user.count(),
    ).rejects.toThrow(/schema-qualified tables/i);
  });
});
