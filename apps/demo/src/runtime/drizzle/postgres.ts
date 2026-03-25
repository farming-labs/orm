import { drizzle as drizzlePostgresDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createDrizzleDriver } from "@farming-labs/orm-drizzle";
import { createOrm, renderSafeSql } from "@farming-labs/orm";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import { pgAdminUrl } from "../shared/config";
import type { DemoRuntimeHandle } from "../shared/types";
import { applyStatements, assignDatabase, createIsolatedName, formatLocalRuntimeError, toDirectCheck } from "../shared/utils";

export async function createDrizzlePostgresRuntime(): Promise<DemoRuntimeHandle> {
  const databaseName = createIsolatedName("farm_orm_demo_drizzle_pg");
  const adminPool = new Pool({ connectionString: pgAdminUrl });

  try {
    await adminPool.query(`create database "${databaseName}"`);
  } catch (error) {
    await adminPool.end();
    throw formatLocalRuntimeError(
      "PostgreSQL",
      error,
      `Set FARM_ORM_DEMO_PG_ADMIN_URL or FARM_ORM_LOCAL_PG_ADMIN_URL if your local admin URL is not ${pgAdminUrl}.`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(pgAdminUrl, databaseName);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await applyStatements(
      (statement) => pool.query(statement),
      renderSafeSql(authSchema, { dialect: "postgres" }),
    );
  } catch (error) {
    await pool.end().catch(() => undefined);
    const cleanupAdmin = new Pool({ connectionString: pgAdminUrl });
    await cleanupAdmin.query(`drop database if exists "${databaseName}"`);
    await cleanupAdmin.end();
    throw error;
  }

  const db = drizzlePostgresDatabase(pool);
  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createDrizzleDriver<typeof authSchema>({
      db,
      dialect: "postgres",
    }),
  });

  return {
    name: "drizzle-postgres",
    label: "Drizzle runtime (postgres)",
    client: "Drizzle node-postgres",
    orm,
    directCheck: async (userId) => {
      const result = await pool.query('select "id", "email_address" from "users" where "id" = $1', [
        userId,
      ]);
      return toDirectCheck(result.rows[0] as { id: string; email_address: string } | undefined);
    },
    close: async () => {
      await pool.end();
      const cleanupAdmin = new Pool({ connectionString: pgAdminUrl });
      await cleanupAdmin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [databaseName],
      );
      await cleanupAdmin.query(`drop database if exists "${databaseName}"`);
      await cleanupAdmin.end();
    },
  };
}
