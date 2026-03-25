import mysql from "mysql2/promise";
import { createOrm, renderSafeSql } from "@farming-labs/orm";
import { createMysqlDriver } from "@farming-labs/orm-sql";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import { mysqlAdminUrl } from "../shared/config";
import { asMysqlConnectionLike, asMysqlPoolLike } from "../shared/mysql";
import type { DemoRuntimeHandle } from "../shared/types";
import {
  applyStatements,
  assignDatabase,
  createIsolatedName,
  formatLocalRuntimeError,
  toDirectCheck,
} from "../shared/utils";

async function dropMysqlDatabase(databaseName: string) {
  const cleanupAdmin = mysql.createPool(mysqlAdminUrl);

  try {
    await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
  } finally {
    await cleanupAdmin.end().catch(() => undefined);
  }
}

export async function createMysqlPoolRuntime(): Promise<DemoRuntimeHandle> {
  const databaseName = createIsolatedName("farm_orm_demo_mysql_pool");
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
    await pool.end();
    await dropMysqlDatabase(databaseName);
    throw error;
  }

  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createMysqlDriver<typeof authSchema>(asMysqlPoolLike(pool)),
  });

  return {
    name: "mysql-pool",
    label: "MySQL runtime (pool)",
    client: "mysql2 pool",
    orm,
    directCheck: async (userId) => {
      const [rows] = await pool.query("select `id`, `email_address` from `users` where `id` = ?", [
        userId,
      ]);
      return toDirectCheck((rows as Array<{ id: string; email_address: string }>)[0]);
    },
    close: async () => {
      await pool.end();
      await dropMysqlDatabase(databaseName);
    },
  };
}

export async function createMysqlConnectionRuntime(): Promise<DemoRuntimeHandle> {
  const databaseName = createIsolatedName("farm_orm_demo_mysql_conn");
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
  let connection: mysql.PoolConnection | null = null;

  try {
    const activeConnection = await pool.getConnection();
    connection = activeConnection;
    await applyStatements(
      (statement) => activeConnection.query(statement),
      renderSafeSql(authSchema, { dialect: "mysql" }),
    );
  } catch (error) {
    connection?.release();
    await pool.end().catch(() => undefined);
    await dropMysqlDatabase(databaseName);
    throw error;
  }

  if (!connection) {
    await pool.end().catch(() => undefined);
    await dropMysqlDatabase(databaseName);
    throw new Error("MySQL demo connection was not established.");
  }

  const activeConnection = connection;

  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createMysqlDriver<typeof authSchema>(asMysqlConnectionLike(activeConnection)),
  });

  return {
    name: "mysql-connection",
    label: "MySQL runtime (connection)",
    client: "mysql2 connection",
    orm,
    directCheck: async (userId) => {
      const [rows] = await activeConnection.query(
        "select `id`, `email_address` from `users` where `id` = ?",
        [userId],
      );
      return toDirectCheck((rows as Array<{ id: string; email_address: string }>)[0]);
    },
    close: async () => {
      activeConnection.release();
      await pool.end();
      await dropMysqlDatabase(databaseName);
    },
  };
}
