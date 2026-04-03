import { describe, expect, it } from "vitest";
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
  schema,
} from "../../mongoose/test/support/auth";
import { createSupabaseDriver } from "../src";
import { createInMemorySupabaseClient, startLocalSupabase } from "./support/local-supabase";

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

async function createLocalSupabaseOrm() {
  const local = await startLocalSupabase();

  return {
    ...local,
    orm: createOrm({
      schema,
      driver: createSupabaseDriver({
        client: local.client,
      }),
    }) as RuntimeOrm,
  };
}

describe("supabase compatibility", () => {
  it("detects Supabase runtimes and creates an ORM from the raw client", async () => {
    const client = createInMemorySupabaseClient();

    const detected = detectDatabaseRuntime(client);
    const inspected = inspectDatabaseRuntime(client);
    const orm = await createOrmFromRuntime({
      schema,
      client,
    });

    expect(detected).toEqual({
      kind: "supabase",
      client,
      dialect: "postgres",
      source: "client",
    });
    expect(inspected.runtime?.kind).toBe("supabase");
    expect(orm.$driver.kind).toBe("supabase");
    expect(orm.$driver.dialect).toBe("postgres");
  });

  it("bootstraps through the runtime setup helpers without requiring schema push", async () => {
    const client = createInMemorySupabaseClient();

    const orm = await bootstrapDatabase({
      schema,
      client,
    });

    await orm.user.create({
      data: {
        email: "bootstrap-supabase@farminglabs.dev",
        name: "Bootstrap",
      },
    });

    expect(await orm.user.count()).toBe(1);
    expect(orm.$driver.kind).toBe("supabase");
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries without requiring transaction rollback support", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertMutationQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enums, bigints, and decimals", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertEnumBigintAndDecimalQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes duplicate-key errors from Supabase writes", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      await local.orm.user.create({
        data: {
          email: "duplicate-supabase@farminglabs.dev",
          name: "Ada",
        },
      });

      const error = await local.orm.user
        .create({
          data: {
            email: "duplicate-supabase@farminglabs.dev",
            name: "Grace",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("supabase");
    } finally {
      await local.close();
    }
  });

  it("normalizes unique lookups for integer and datetime fields", async () => {
    const local = await startLocalSupabase();

    try {
      const orm = createOrm({
        schema: normalizedUniqueLookupSchema,
        driver: createSupabaseDriver({
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
  });

  it("supports generated integer ids when the table assigns them", async () => {
    const local = await startLocalSupabase();

    try {
      const orm = createOrm({
        schema: generatedNumericIdSchema,
        driver: createSupabaseDriver({
          client: local.client,
        }),
      });

      const created = await orm.auditEvent.create({
        data: {
          email: "generated-supabase@farminglabs.dev",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: 1,
        email: "generated-supabase@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("supports schema-qualified tables through the Supabase schema client", async () => {
    const local = await startLocalSupabase();

    try {
      const orm = createOrm({
        schema: namespacedSchema,
        driver: createSupabaseDriver({
          client: local.client,
        }),
      });

      await orm.user.create({
        data: {
          id: "user_1",
          email: "namespaced-supabase@farminglabs.dev",
        },
      });

      const user = await orm.user.findUnique({
        where: {
          email: "namespaced-supabase@farminglabs.dev",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(user).toEqual({
        id: "user_1",
        email: "namespaced-supabase@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("ignores false select entries instead of treating them like relation payloads", async () => {
    const local = await createLocalSupabaseOrm();

    try {
      const user = await local.orm.user.create({
        data: {
          email: "false-select-supabase@farminglabs.dev",
          name: "False Select",
        },
      });

      await local.orm.session.create({
        data: {
          id: "false_select_session",
          userId: user.id,
          token: "false-select-token",
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      });

      const selected = await local.orm.user.findUnique({
        where: {
          id: user.id,
        },
        select: {
          email: true,
          sessions: false as never,
        },
      });

      expect(selected).toEqual({
        email: "false-select-supabase@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });
});
