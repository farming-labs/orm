import { describe, expect, it } from "vitest";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  createOrm,
  datetime,
  defineSchema,
  detectDatabaseRuntime,
  id,
  integer,
  inspectDatabaseRuntime,
  isOrmError,
  model,
  string,
  tableName,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import { createDynamodbDriver } from "../src";
import { startLocalDynamoDb } from "./support/local-dynamodb";
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
import type { DynamoDbDocumentClientLike } from "../src";

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

const normalizedUniqueLookupSchema = defineSchema({
  event: model({
    table: "events",
    fields: {
      id: id(),
      revision: integer().unique(),
      occurredAt: datetime().unique(),
      name: string(),
    },
  }),
});

const fallbackIntegritySchema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
    },
  }),
});

function createConditionalCheckFailedError(target?: string | string[]) {
  const error = new Error("ConditionalCheckFailedException");
  Object.assign(error, {
    name: "ConditionalCheckFailedException",
    code: "ConditionalCheckFailedException",
    target,
  });
  return error;
}

function uniqueLockPk(modelName: string, fields: string[], values: unknown[]) {
  return `unique#${modelName}#${fields.join("+")}#${values
    .map((value) => encodeURIComponent(JSON.stringify(value)))
    .join("#")}`;
}

function createFailingDocumentClient(
  base: DynamoDbDocumentClientLike,
  options: {
    failOnPk: string;
    target?: string | string[];
  },
) {
  return {
    send: async (command: unknown) => {
      if (command instanceof PutCommand) {
        const item = command.input.Item as Record<string, unknown> | undefined;
        if (item?.__orm_pk === options.failOnPk) {
          throw createConditionalCheckFailedError(options.target);
        }
      }

      return base.send(command);
    },
  } as DynamoDbDocumentClientLike;
}

async function createLocalDynamoOrm(options?: { documentClient?: DynamoDbDocumentClientLike }) {
  const local = await startLocalDynamoDb();

  try {
    await pushSchema({
      schema,
      client: local.client,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createDynamodbDriver({
          client: local.client,
          ...(options?.documentClient ? { documentClient: options.documentClient } : {}),
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

describe("dynamodb local integration", () => {
  it("detects DynamoDB runtimes and creates an ORM from the raw client", async () => {
    const local = await startLocalDynamoDb();

    try {
      const detected = detectDatabaseRuntime(local.client);
      const inspected = inspectDatabaseRuntime(local.client);

      await pushSchema({
        schema,
        client: local.client,
      });

      const orm = (await createOrmFromRuntime({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      expect(detected).toEqual({
        kind: "dynamodb",
        client: local.client,
        source: "client",
      });
      expect(inspected.runtime?.kind).toBe("dynamodb");
      expect(orm.$driver.kind).toBe("dynamodb");
      expect(orm.$driver.capabilities).toEqual({
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: false,
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
        upsert: "emulated",
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
    } finally {
      await local.close();
    }
  });

  it("bootstraps through the runtime setup helpers", async () => {
    const local = await startLocalDynamoDb();

    try {
      const orm = (await bootstrapDatabase({
        schema,
        client: local.client,
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
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries without requiring transaction rollback support", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: false,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enum, bigint, and decimal fields", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertEnumBigintAndDecimalQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes duplicate key errors from DynamoDB writes", async () => {
    const local = await createLocalDynamoOrm();

    try {
      await local.orm.user.create({
        data: {
          email: "duplicate@farminglabs.dev",
          name: "First",
        },
      });

      const error = await local.orm.user
        .create({
          data: {
            email: "duplicate@farminglabs.dev",
            name: "Second",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("dynamodb");
    } finally {
      await local.close();
    }
  });

  it("does not persist a record when the sequential create fallback loses a unique lock", async () => {
    const local = await startLocalDynamoDb();

    try {
      await pushSchema({
        schema: fallbackIntegritySchema,
        client: local.client,
      });

      const orm = createOrm({
        schema: fallbackIntegritySchema,
        driver: createDynamodbDriver({
          client: local.client,
          documentClient: createFailingDocumentClient(local.documentClient, {
            failOnPk: uniqueLockPk("user", ["email"], ["conflict@farminglabs.dev"]),
            target: ["email"],
          }),
        }),
      });

      const error = await orm.user
        .create({
          data: {
            email: "conflict@farminglabs.dev",
            name: "Conflict",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(
        await orm.user.count({
          where: {
            email: "conflict@farminglabs.dev",
          },
        }),
      ).toBe(0);
    } finally {
      await local.close();
    }
  });

  it("does not partially apply updates when the sequential fallback loses a new unique lock", async () => {
    const local = await startLocalDynamoDb();

    try {
      await pushSchema({
        schema: fallbackIntegritySchema,
        client: local.client,
      });

      const baseOrm = createOrm({
        schema: fallbackIntegritySchema,
        driver: createDynamodbDriver({
          client: local.client,
        }),
      });

      const created = await baseOrm.user.create({
        data: {
          email: "before@farminglabs.dev",
          name: "Before",
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      const failingOrm = createOrm({
        schema: fallbackIntegritySchema,
        driver: createDynamodbDriver({
          client: local.client,
          documentClient: createFailingDocumentClient(local.documentClient, {
            failOnPk: uniqueLockPk("user", ["email"], ["after@farminglabs.dev"]),
            target: ["email"],
          }),
        }),
      });

      const error = await failingOrm.user
        .update({
          where: {
            id: created.id,
          },
          data: {
            email: "after@farminglabs.dev",
          },
          select: {
            id: true,
            email: true,
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(
        await baseOrm.user.findUnique({
          where: {
            id: created.id,
          },
          select: {
            email: true,
            name: true,
          },
        }),
      ).toEqual({
        email: "before@farminglabs.dev",
        name: "Before",
      });
      expect(
        await baseOrm.user.findUnique({
          where: {
            email: "after@farminglabs.dev",
          },
          select: {
            id: true,
          },
        }),
      ).toBeNull();
    } finally {
      await local.close();
    }
  });

  it("rejects generated integer ids for DynamoDB", async () => {
    const local = await startLocalDynamoDb();

    try {
      await pushSchema({
        schema: generatedNumericIdSchema,
        client: local.client,
      });

      await expect(
        createOrm({
          schema: generatedNumericIdSchema,
          driver: createDynamodbDriver({
            client: local.client,
          }),
        }).auditEvent.create({
          data: {
            email: "generated@farminglabs.dev",
          },
        }),
      ).rejects.toThrow(/generated integer ids/i);
    } finally {
      await local.close();
    }
  });

  it("rejects schema-qualified tables for DynamoDB", async () => {
    const local = await startLocalDynamoDb();

    try {
      await expect(
        pushSchema({
          schema: namespacedSchema,
          client: local.client,
        }),
      ).rejects.toThrow(/schema-qualified tables/i);
    } finally {
      await local.close();
    }
  });

  it("normalizes numeric and datetime unique filters before matching rows", async () => {
    const local = await startLocalDynamoDb();

    try {
      const orm = await bootstrapDatabase({
        schema: normalizedUniqueLookupSchema,
        client: local.client,
      });
      const occurredAt = new Date("2026-03-31T00:00:00.000Z");

      await orm.event.create({
        data: {
          revision: 7,
          occurredAt,
          name: "Launch",
        },
      });

      const byRevision = await orm.event.findUnique({
        where: {
          revision: "7" as unknown as number,
        },
        select: {
          name: true,
        },
      });
      const byDate = await orm.event.findUnique({
        where: {
          occurredAt: occurredAt.toISOString() as unknown as Date,
        },
        select: {
          name: true,
        },
      });

      expect(byRevision).toEqual({
        name: "Launch",
      });
      expect(byDate).toEqual({
        name: "Launch",
      });
    } finally {
      await local.close();
    }
  });
});
