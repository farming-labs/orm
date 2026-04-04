import { afterEach, describe, expect, it } from "vitest";
import {
  createOrm,
  detectDatabaseRuntime,
  defineSchema,
  id,
  inspectDatabaseRuntime,
  integer,
  isOrmError,
  model,
  string,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase } from "@farming-labs/orm-runtime/setup";
import type { RuntimeOrm } from "../../mongoose/test/support/auth";
import {
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertEnumBigintAndDecimalQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  seedAuthData,
} from "../../mongoose/test/support/auth";
import { createXataDriver } from "../src";
import {
  cleanupRealXataSchema,
  createRealAuthSchema,
  createRealGeneratedNumericSchema,
  createRealNamespacedSchema,
  createRealXataClient,
  createRealXataPrefix,
  shouldRunRealXataTests,
} from "./support/real-xata";

const itIfReal = shouldRunRealXataTests() ? it : it.skip;
const REAL_XATA_TIMEOUT_MS = 90_000;
const pendingCleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (pendingCleanups.length) {
    const cleanup = pendingCleanups.pop()!;
    await cleanup();
  }
});

const normalizedUniqueLookupSchema = defineSchema({
  event: model({
    table: "events",
    fields: {
      id: id(),
      revision: integer().unique(),
      name: string(),
    },
  }),
});

async function createRealXataOrm() {
  const { client } = await createRealXataClient();
  const prefix = createRealXataPrefix();
  const schema = createRealAuthSchema(prefix);

  await cleanupRealXataSchema(client, schema);
  pendingCleanups.push(async () => {
    await cleanupRealXataSchema(client, schema);
  });

  return {
    client,
    schema,
    prefix,
    orm: createOrm({
      schema,
      driver: createXataDriver({
        client,
      }),
    }) as unknown as RuntimeOrm,
  };
}

describe.sequential("xata real integration", () => {
  itIfReal(
    "detects and bootstraps a real Xata client",
    async () => {
      const { client } = await createRealXataClient();
      const prefix = createRealXataPrefix();
      const schema = createRealAuthSchema(prefix);

      await cleanupRealXataSchema(client, schema);
      pendingCleanups.push(async () => {
        await cleanupRealXataSchema(client, schema);
      });

      const detected = detectDatabaseRuntime(client);
      const inspected = inspectDatabaseRuntime(client);
      const orm = (await bootstrapDatabase({
        schema,
        client,
      })) as unknown as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "real-xata@farminglabs.dev",
          name: "Real Xata",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(detected?.kind).toBe("xata");
      expect(inspected.runtime?.kind).toBe("xata");
      expect(created).toEqual({
        id: expect.any(String),
        email: "real-xata@farminglabs.dev",
      });
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "creates an ORM directly from a real Xata client",
    async () => {
      const { client } = await createRealXataClient();
      const prefix = createRealXataPrefix();
      const schema = createRealAuthSchema(prefix);

      await cleanupRealXataSchema(client, schema);
      pendingCleanups.push(async () => {
        await cleanupRealXataSchema(client, schema);
      });

      const orm = (await createOrmFromRuntime({
        schema,
        client,
      })) as unknown as RuntimeOrm;

      await seedAuthData(orm);

      const loaded = await orm.user.findUnique({
        where: {
          email: "ada@farminglabs.dev",
        },
        select: {
          email: true,
        },
      });

      expect(loaded).toEqual({
        email: "ada@farminglabs.dev",
      });
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "supports auth-style relation reads against a real Xata backend",
    async () => {
      const oneToOne = await createRealXataOrm();
      await bootstrapDatabase({
        schema: oneToOne.schema,
        client: oneToOne.client,
      });
      await assertOneToOneAndHasManyQueries(oneToOne.orm, expect);

      const relationOrm = await createRealXataOrm();
      await bootstrapDatabase({
        schema: relationOrm.schema,
        client: relationOrm.client,
      });
      await assertBelongsToAndManyToManyQueries(relationOrm.orm, expect);
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "supports mutations, upserts, and compound uniques against a real Xata backend",
    async () => {
      const mutationOrm = await createRealXataOrm();
      await bootstrapDatabase({
        schema: mutationOrm.schema,
        client: mutationOrm.client,
      });
      await assertMutationQueries(mutationOrm.orm, expect, {
        expectTransactionRollback: false,
      });

      const compoundOrm = await createRealXataOrm();
      await bootstrapDatabase({
        schema: compoundOrm.schema,
        client: compoundOrm.client,
      });
      await assertCompoundUniqueQueries(compoundOrm.orm, expect);
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "supports scalar coverage against a real Xata backend",
    async () => {
      const integerJson = await createRealXataOrm();
      await bootstrapDatabase({
        schema: integerJson.schema,
        client: integerJson.client,
      });
      await assertIntegerAndJsonQueries(integerJson.orm, expect);

      const scalarOrm = await createRealXataOrm();
      await bootstrapDatabase({
        schema: scalarOrm.schema,
        client: scalarOrm.client,
      });
      await assertEnumBigintAndDecimalQueries(scalarOrm.orm, expect);
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "enforces model-level constraints and duplicate-key normalization against a real Xata backend",
    async () => {
      const constrained = await createRealXataOrm();
      await bootstrapDatabase({
        schema: constrained.schema,
        client: constrained.client,
      });
      await assertModelLevelConstraints(constrained.orm, expect);

      const duplicate = await createRealXataOrm();
      await bootstrapDatabase({
        schema: duplicate.schema,
        client: duplicate.client,
      });
      await duplicate.orm.user.create({
        data: {
          email: "duplicate-real-xata@farminglabs.dev",
          name: "First",
        },
      });

      const error = await duplicate.orm.user
        .create({
          data: {
            email: "duplicate-real-xata@farminglabs.dev",
            name: "Second",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("xata");
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "supports generated numeric ids against a real Xata backend",
    async () => {
      const { client } = await createRealXataClient();
      const prefix = createRealXataPrefix();
      const schema = createRealGeneratedNumericSchema(prefix);

      await cleanupRealXataSchema(client, schema);
      pendingCleanups.push(async () => {
        await cleanupRealXataSchema(client, schema);
      });

      const orm = await bootstrapDatabase({
        schema,
        client,
      });

      const created = await orm.auditEvent.create({
        data: {
          email: "generated-real-xata@farminglabs.dev",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(Number),
        email: "generated-real-xata@farminglabs.dev",
      });
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "supports namespaced tables against a real Xata backend",
    async () => {
      const { client } = await createRealXataClient();
      const prefix = createRealXataPrefix();
      const schema = createRealNamespacedSchema(prefix);

      await cleanupRealXataSchema(client, schema);
      pendingCleanups.push(async () => {
        await cleanupRealXataSchema(client, schema);
      });

      const orm = await bootstrapDatabase({
        schema,
        client,
      });

      const created = await orm.user.create({
        data: {
          email: "namespaced-real-xata@farminglabs.dev",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "namespaced-real-xata@farminglabs.dev",
      });
    },
    REAL_XATA_TIMEOUT_MS,
  );

  itIfReal(
    "normalizes unique lookups against a real Xata backend",
    async () => {
      const { client } = await createRealXataClient();
      const prefix = createRealXataPrefix();
      const schema = defineSchema({
        event: model({
          table: `${prefix}_events`,
          fields: normalizedUniqueLookupSchema.models.event.fields,
        }),
      });

      await cleanupRealXataSchema(client, schema);
      pendingCleanups.push(async () => {
        await cleanupRealXataSchema(client, schema);
      });

      const orm = await bootstrapDatabase({
        schema,
        client,
      });

      await orm.event.create({
        data: {
          revision: 7,
          name: "Launch",
        },
      });

      const event = await orm.event.findUnique({
        where: {
          revision: "7" as unknown as number,
        },
        select: {
          revision: true,
          name: true,
        },
      });

      expect(event).toEqual({
        revision: 7,
        name: "Launch",
      });
    },
    REAL_XATA_TIMEOUT_MS,
  );
});
