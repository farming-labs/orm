import mysql from "mysql2/promise";
import { createOrm, renderSafeSql } from "@farming-labs/orm";
import { createMysqlDriver } from "@farming-labs/orm-sql";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import { mysqlAdminUrl } from "../shared/config";
import { asMysqlConnectionLike, asMysqlPoolLike } from "../shared/mysql";
import type { DemoRuntimeHandle } from "../shared/types";
import { applyStatements, assignDatabase, createIsolatedName, formatLocalRuntimeError, toDirectCheck } from "../shared/utils";

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
    const cleanupAdmin = mysql.createPool(mysqlAdminUrl);
    await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
    await cleanupAdmin.end();
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
      const cleanupAdmin = mysql.createPool(mysqlAdminUrl);
      await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
      await cleanupAdmin.end();
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
  const connection = await pool.getConnection();

  try {
    await applyStatements(
      (statement) => connection.query(statement),
      renderSafeSql(authSchema, { dialect: "mysql" }),
    );
  } catch (error) {
    connection.release();
    await pool.end();
    const cleanupAdmin = mysql.createPool(mysqlAdminUrl);
    await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
    await cleanupAdmin.end();
    throw error;
  }

  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createMysqlDriver<typeof authSchema>(asMysqlConnectionLike(connection)),
  });

  return {
    name: "mysql-connection",
    label: "MySQL runtime (connection)",
    client: "mysql2 connection",
    orm,
    directCheck: async (userId) => {
      const [rows] = await connection.query(
        "select `id`, `email_address` from `users` where `id` = ?",
        [userId],
      );
      return toDirectCheck((rows as Array<{ id: string; email_address: string }>)[0]);
    },
    close: async () => {
      connection.release();
      await pool.end();
      const cleanupAdmin = mysql.createPool(mysqlAdminUrl);
      await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
      await cleanupAdmin.end();
    },
  };
}
