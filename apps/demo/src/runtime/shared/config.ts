import { userInfo } from "node:os";

export const pgDefaultAdminUrl = `postgres://${userInfo().username}@127.0.0.1:5432/postgres`;
export const pgAdminUrl =
  process.env.FARM_ORM_DEMO_PG_ADMIN_URL ??
  process.env.FARM_ORM_LOCAL_PG_ADMIN_URL ??
  pgDefaultAdminUrl;

export const mysqlAdminUrl =
  process.env.FARM_ORM_DEMO_MYSQL_ADMIN_URL ??
  process.env.FARM_ORM_LOCAL_MYSQL_ADMIN_URL ??
  "mysql://root@127.0.0.1:3306";

export const mongoBaseUrl =
  process.env.FARM_ORM_DEMO_MONGODB_URL ??
  process.env.FARM_ORM_LOCAL_MONGODB_URL ??
  "mongodb://127.0.0.1:27017";
