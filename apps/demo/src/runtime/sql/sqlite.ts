import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createOrm, renderSafeSql } from "@farming-labs/orm";
import { createSqliteDriver } from "@farming-labs/orm-sql";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import type { DemoRuntimeHandle } from "../shared/types";
import { applyStatements, toDirectCheck } from "../shared/utils";

export async function createSqliteRuntime(): Promise<DemoRuntimeHandle> {
  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-demo-sqlite-"));
  const databasePath = path.join(directory, "demo.db");
  const database = new DatabaseSync(databasePath);

  await applyStatements(
    database.exec.bind(database),
    renderSafeSql(authSchema, { dialect: "sqlite" }),
  );

  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createSqliteDriver<typeof authSchema>(database),
  });

  return {
    name: "sqlite",
    label: "SQLite runtime",
    client: "node:sqlite DatabaseSync",
    orm,
    directCheck: async (userId) => {
      const rows = database
        .prepare('select "id", "email_address" from "users" where "id" = ?')
        .all(userId) as Array<{ id: string; email_address: string }>;

      return toDirectCheck(rows[0]);
    },
    close: async () => {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
