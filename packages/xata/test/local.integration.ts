import { describe, expect, it } from "vitest";
import { BaseClient } from "@xata.io/client";
import {
  createOrm,
  datetime,
  defineSchema,
  detectDatabaseRuntime,
  id,
  inspectDatabaseRuntime,
  integer,
  isOrmError,
  model,
  string,
  tableName,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
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
import { createXataDriver } from "../src";
import { startLocalXata } from "./support/local-xata";

const LOCAL_TIMEOUT_MS = 30_000;

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

async function createLocalXataOrm() {
  const local = await startLocalXata();

  try {
    await pushSchema({
      schema,
      client: local.client,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createXataDriver({
          client: local.client,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

describe("xata integration", () => {
  it(
    "detects official Xata client shapes",
    async () => {
      const client = new BaseClient(
        {
          apiKey: "test",
          databaseURL: "https://workspace.eu-west-1.xata.sh/db/demo:main",
          branch: "main",
        },
        [],
      );

      expect(detectDatabaseRuntime(client)?.kind).toBe("xata");
      expect(inspectDatabaseRuntime(client).runtime?.kind).toBe("xata");
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "detects Xata runtimes and creates an ORM from the raw client",
    async () => {
      const local = await startLocalXata();

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
          kind: "xata",
          client: local.client,
          dialect: "postgres",
          source: "client",
        });
        expect(inspected.runtime?.kind).toBe("xata");
        expect(orm.$driver.kind).toBe("xata");
        expect(orm.$driver.dialect).toBe("postgres");
        expect(orm.$driver.capabilities.supportsTransactions).toBe(false);
        expect(orm.$driver.capabilities.supportsSchemaNamespaces).toBe(true);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "bootstraps through the runtime setup helpers",
    async () => {
      const local = await startLocalXata();

      try {
        const orm = (await bootstrapDatabase({
          schema,
          client: local.client,
        })) as RuntimeOrm;

        const created = await orm.user.create({
          data: {
            email: "bootstrap-xata@farminglabs.dev",
            name: "Bootstrap",
          },
          select: {
            id: true,
            email: true,
          },
        });

        expect(created).toEqual({
          id: expect.any(String),
          email: "bootstrap-xata@farminglabs.dev",
        });
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "runs auth-style one-to-one and has-many queries",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertOneToOneAndHasManyQueries(local.orm, expect);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "runs belongs-to and many-to-many queries",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertBelongsToAndManyToManyQueries(local.orm, expect);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "runs mutation queries without claiming rollback semantics",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertMutationQueries(local.orm, expect, {
          expectTransactionRollback: false,
        });
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports compound unique lookups and upserts",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertCompoundUniqueQueries(local.orm, expect);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports integer and json fields",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertIntegerAndJsonQueries(local.orm, expect);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports enums, bigints, and decimals",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertEnumBigintAndDecimalQueries(local.orm, expect);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "enforces model-level unique constraints",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await assertModelLevelConstraints(local.orm, expect);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "normalizes duplicate-key errors from Xata writes",
    async () => {
      const local = await createLocalXataOrm();

      try {
        await local.orm.user.create({
          data: {
            email: "duplicate-xata@farminglabs.dev",
            name: "Ada",
          },
        });

        const error = await local.orm.user
          .create({
            data: {
              email: "duplicate-xata@farminglabs.dev",
              name: "Grace",
            },
          })
          .catch((reason) => reason);

        expect(isOrmError(error)).toBe(true);
        expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
        expect(error.backendKind).toBe("xata");
        expect(error.dialect).toBe("postgres");
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "normalizes unique lookups for integer and datetime fields",
    async () => {
      const local = await startLocalXata();

      try {
        await pushSchema({
          schema: normalizedUniqueLookupSchema,
          client: local.client,
        });

        const orm = createOrm({
          schema: normalizedUniqueLookupSchema,
          driver: createXataDriver({
            client: local.client,
          }),
        });

        await orm.event.create({
          data: {
            id: "event_1",
            revision: 7,
            occurredAt: new Date("2026-04-02T12:34:56.000Z"),
            name: "Launch",
          },
        });

        const integerMatch = await orm.event.findUnique({
          where: {
            revision: "7" as never,
          },
        });

        const datetimeMatch = await orm.event.findUnique({
          where: {
            occurredAt: "2026-04-02T12:34:56.000Z" as never,
          },
        });

        expect(integerMatch?.name).toBe("Launch");
        expect(datetimeMatch?.name).toBe("Launch");
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports generated integer ids through the Xata SQL path",
    async () => {
      const local = await startLocalXata();

      try {
        await pushSchema({
          schema: generatedNumericIdSchema,
          client: local.client,
        });

        const orm = createOrm({
          schema: generatedNumericIdSchema,
          driver: createXataDriver({
            client: local.client,
          }),
        });

        const created = await orm.auditEvent.create({
          data: {
            email: "numeric-xata@farminglabs.dev",
          },
        });

        expect(created.id).toBe(1);
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports namespaced tables through the Xata SQL path",
    async () => {
      const local = await startLocalXata();

      try {
        await pushSchema({
          schema: namespacedSchema,
          client: local.client,
        });

        const orm = createOrm({
          schema: namespacedSchema,
          driver: createXataDriver({
            client: local.client,
          }),
        });

        const created = await orm.user.create({
          data: {
            email: "namespaced-xata@farminglabs.dev",
          },
        });

        expect(created.email).toBe("namespaced-xata@farminglabs.dev");
      } finally {
        await local.close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );
});
