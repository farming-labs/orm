import { drizzle as drizzleMysqlDatabase } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { createDrizzleDriver } from "@farming-labs/orm-drizzle";
import { createOrm, renderSafeSql } from "@farming-labs/orm";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import { mysqlAdminUrl } from "../shared/config";
import type { DemoRuntimeHandle } from "../shared/types";
import {
  applyStatements,
  assignDatabase,
  createIsolatedName,
  formatLocalRuntimeError,
  toDirectCheck,
} from "../shared/utils";

export async function createDrizzleMysqlRuntime(): Promise<DemoRuntimeHandle> {
  const databaseName = createIsolatedName("farm_orm_demo_drizzle_mysql");
  const adminPool = mysql.createPool(mysqlAdminUrl);

  try {
    await adminPool.query(`create database \`${databaseName}\``);
  } catch (error) {
    await adminPool.end();
    throw formatLocalRuntimeError(
      "MySQL",
      error,
      `Set FARM_ORM_DEMO_MYSQL_ADMIN_URL or FARM_ORM_LOCAL_MYSQL_ADMIN_URL if your local admin URL is not ${mysqlAdminUrl}.`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(mysqlAdminUrl, databaseName);
  const pool = mysql.createPool(databaseUrl);

  try {
    await applyStatements(
      (statement) => pool.query(statement),
      renderSafeSql(authSchema, { dialect: "mysql" }),
    );
  } catch (error) {
    await pool.end().catch(() => undefined);
    const cleanupAdmin = mysql.createPool(mysqlAdminUrl);
    await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
    await cleanupAdmin.end();
    throw error;
  }

  const db = drizzleMysqlDatabase(pool);
  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createDrizzleDriver<typeof authSchema>({
      db,
      dialect: "mysql",
    }),
  });

  return {
    name: "drizzle-mysql",
    label: "Drizzle runtime (mysql)",
    client: "Drizzle mysql2",
    orm,
    directCheck: async (userId) => {
      const [rows] = await pool.query("select `id`, `email_address` from `users` where `id` = ?", [
        userId,
      ]);
      return toDirectCheck((rows as Array<{ id: string; email_address: string }>)[0]);
    },
    close: async () => {
      await pool.end();
      const cleanupAdmin = mysql.createPool(mysqlAdminUrl);
      await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
      await cleanupAdmin.end();
    },
  };
}
