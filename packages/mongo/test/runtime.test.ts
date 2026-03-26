import { describe, expect, it } from "vitest";
import {
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertIntegerAndJsonQueries,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  schema,
} from "../../mongoose/test/support/auth";
import { createOrm } from "@farming-labs/orm";
import { createMongoDriver } from "../src";
import { createTestCollections, createTestManager, createTestRuntime } from "./support/fake-mongo";

describe("mongo runtime", () => {
  it("supports one-to-one and one-to-many reads in the fast unit runtime", async () => {
    const { orm, manager } = createTestRuntime();

    await assertOneToOneAndHasManyQueries(orm, expect);

    expect(manager.state.users[0]).toHaveProperty("_id");
    expect(manager.state.sessions[0]).toHaveProperty("user_id");
  });

  it("supports belongsTo and many-to-many traversal in the fast unit runtime", async () => {
    const { orm } = createTestRuntime();

    await assertBelongsToAndManyToManyQueries(orm, expect);
  });

  it("supports updates, upserts, deletes, and rollback in the fast unit runtime", async () => {
    const { orm } = createTestRuntime();

    await assertMutationQueries(orm, expect, {
      expectTransactionRollback: true,
    });
  });

  it("supports compound-unique lookups and upserts in the fast unit runtime", async () => {
    const { orm } = createTestRuntime();

    await assertCompoundUniqueQueries(orm, expect);
  });

  it("supports integer and json fields in the fast unit runtime", async () => {
    const { orm } = createTestRuntime();

    await assertIntegerAndJsonQueries(orm, expect);
  });

  it("falls back to non-transactional execution when no session source is configured", async () => {
    const manager = createTestManager();
    const orm = createOrm({
      schema,
      driver: createMongoDriver<typeof schema>({
        collections: createTestCollections(manager),
      }),
    });

    await expect(
      orm.transaction(async () => {
        return "ok";
      }),
    ).resolves.toBe("ok");
  });
});
