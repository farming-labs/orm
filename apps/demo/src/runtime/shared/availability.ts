import mysql from "mysql2/promise";
import mongoose from "mongoose";
import { Pool } from "pg";
import type { AvailabilityResult } from "./types";
import { mongoBaseUrl, mysqlAdminUrl, pgAdminUrl } from "./config";
import { formatLocalRuntimeError } from "./utils";

export async function alwaysAvailable(): Promise<AvailabilityResult> {
  return {
    available: true,
  };
}

export async function probePostgres(): Promise<AvailabilityResult> {
  const pool = new Pool({ connectionString: pgAdminUrl });

  try {
    await pool.query("select 1");
    return {
      available: true,
    };
  } catch (error) {
    return {
      available: false,
      reason: formatLocalRuntimeError(
        "PostgreSQL",
        error,
        `Set FARM_ORM_DEMO_PG_ADMIN_URL or FARM_ORM_LOCAL_PG_ADMIN_URL if your local admin URL is not ${pgAdminUrl}.`,
      ).message,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function probeMysql(): Promise<AvailabilityResult> {
  const pool = mysql.createPool(mysqlAdminUrl);

  try {
    await pool.query("select 1");
    return {
      available: true,
    };
  } catch (error) {
    return {
      available: false,
      reason: formatLocalRuntimeError(
        "MySQL",
        error,
        `Set FARM_ORM_DEMO_MYSQL_ADMIN_URL or FARM_ORM_LOCAL_MYSQL_ADMIN_URL if your local admin URL is not ${mysqlAdminUrl}.`,
      ).message,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function probeMongo(): Promise<AvailabilityResult> {
  const connection = mongoose.createConnection(mongoBaseUrl, {
    serverSelectionTimeoutMS: 2_500,
    connectTimeoutMS: 2_500,
  });

  try {
    await connection.asPromise();
    return {
      available: true,
    };
  } catch (error) {
    return {
      available: false,
      reason: formatLocalRuntimeError(
        "MongoDB",
        error,
        `Set FARM_ORM_DEMO_MONGODB_URL or FARM_ORM_LOCAL_MONGODB_URL if your local MongoDB URL is not ${mongoBaseUrl}.`,
      ).message,
    };
  } finally {
    await connection.close().catch(() => undefined);
  }
}
