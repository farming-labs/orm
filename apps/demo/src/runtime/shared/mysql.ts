import mysql from "mysql2/promise";
import type { MysqlConnectionLike, MysqlPoolLike } from "@farming-labs/orm-sql";

export function asMysqlConnectionLike(connection: mysql.PoolConnection): MysqlConnectionLike {
  return {
    execute(sql, params) {
      return connection.execute(sql as string, params as any) as Promise<[any, unknown]>;
    },
    beginTransaction() {
      return connection.beginTransaction();
    },
    commit() {
      return connection.commit();
    },
    rollback() {
      return connection.rollback();
    },
    release() {
      connection.release();
    },
  };
}

export function asMysqlPoolLike(pool: mysql.Pool): MysqlPoolLike {
  return {
    execute(sql, params) {
      return pool.execute(sql as string, params as any) as Promise<[any, unknown]>;
    },
    async getConnection() {
      return asMysqlConnectionLike(await pool.getConnection());
    },
  };
}
