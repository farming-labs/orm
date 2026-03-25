import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle as drizzleSqliteDatabase } from "drizzle-orm/sqlite-proxy";
import { createDrizzleDriver } from "@farming-labs/orm-drizzle";
import { createOrm, renderSafeSql } from "@farming-labs/orm";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import type { DemoRuntimeHandle } from "../shared/types";
import { applyStatements, toDirectCheck } from "../shared/utils";

export async function createDrizzleSqliteRuntime(): Promise<DemoRuntimeHandle> {
  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-demo-drizzle-sqlite-"));
  const databasePath = path.join(directory, "demo.db");
  const database = new DatabaseSync(databasePath);

  await applyStatements(
    database.exec.bind(database),
    renderSafeSql(authSchema, { dialect: "sqlite" }),
  );

  const db = drizzleSqliteDatabase(async (sql, params, method) => {
    const statement = database.prepare(sql);

    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }

    if (method === "get") {
      const row = statement.get(...params) as Record<string, unknown> | undefined;
      return { rows: row ? [row] : [] };
    }

    return {
      rows: statement.all(...params) as Record<string, unknown>[],
    };
  });

  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createDrizzleDriver<typeof authSchema>({
      db,
      client: database,
      dialect: "sqlite",
    }),
  });

  return {
    name: "drizzle-sqlite",
    label: "Drizzle runtime (sqlite)",
    client: "Drizzle sqlite-proxy",
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
