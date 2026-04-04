import path from "node:path";
import {
  bigint,
  boolean,
  createManifest,
  decimal,
  datetime,
  defineSchema,
  enumeration,
  hasMany,
  hasOne,
  id,
  integer,
  json,
  manyToMany,
  model,
  belongsTo,
  string,
  tableName,
  type SchemaDefinition,
} from "@farming-labs/orm";
import { createIsolatedName } from "../../../mongoose/test/support/auth";
import type { XataClientLike } from "../../src";

type XataModule = typeof import("@xata.io/client");
type RealXataClient = InstanceType<XataModule["BaseClient"]>;

function loadWorkspaceEnvFile() {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  try {
    process.loadEnvFile?.(rootEnvPath);
  } catch {}
}

loadWorkspaceEnvFile();

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function qualifiedTableName(table: { table: string; schema?: string | undefined }) {
  if (table.schema) {
    return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.table)}`;
  }

  return quoteIdentifier(table.table);
}

async function runXataStatement(client: XataClientLike, statement: string) {
  await client.sql({
    statement,
    params: [],
    responseType: "json",
  });
}

export function shouldRunRealXataTests() {
  if (
    process.env.FARM_ORM_SKIP_REAL_XATA_TESTS === "1" ||
    process.env.FARM_ORM_SKIP_REAL_XATA_TESTS === "true"
  ) {
    return false;
  }

  if (
    process.env.FARM_ORM_FORCE_REAL_XATA_TESTS === "1" ||
    process.env.FARM_ORM_FORCE_REAL_XATA_TESTS === "true"
  ) {
    return true;
  }

  return Boolean(
    readEnv("FARM_ORM_LOCAL_XATA_API_KEY", "XATA_API_KEY") &&
    readEnv("FARM_ORM_LOCAL_XATA_DATABASE_URL", "XATA_DATABASE_URL"),
  );
}

export function realXataConfig() {
  const apiKey = readEnv("FARM_ORM_LOCAL_XATA_API_KEY", "XATA_API_KEY");
  const databaseURL = readEnv("FARM_ORM_LOCAL_XATA_DATABASE_URL", "XATA_DATABASE_URL");
  const branch = readEnv("FARM_ORM_LOCAL_XATA_BRANCH", "XATA_BRANCH");

  if (!apiKey || !databaseURL) {
    throw new Error("Real Xata integration tests require an API key and database URL.");
  }

  return {
    apiKey,
    databaseURL,
    branch,
  };
}

export async function createRealXataClient() {
  const { BaseClient } = (await import("@xata.io/client")) as XataModule;
  const config = realXataConfig();

  return {
    client: new BaseClient(
      {
        apiKey: config.apiKey,
        databaseURL: config.databaseURL,
        branch: config.branch,
      },
      [],
    ) as unknown as XataClientLike,
    config,
  };
}

export function createRealXataPrefix() {
  return createIsolatedName("farm_orm_xata");
}

export function createRealAuthSchema(prefix: string) {
  return defineSchema({
    user: model({
      table: `${prefix}_users`,
      fields: {
        id: id().map("_id"),
        email: string().unique(),
        name: string(),
        emailVerified: boolean().default(false).map("email_verified"),
        loginCount: integer().default(0).map("login_count"),
        tier: enumeration(["free", "pro", "enterprise"]).default("free"),
        quota: bigint().default(0n).map("quota_bigint"),
        createdAt: datetime().defaultNow().map("created_at"),
        updatedAt: datetime().defaultNow().map("updated_at"),
      },
      relations: {
        profile: hasOne("profile", { foreignKey: "userId" }),
        sessions: hasMany("session", { foreignKey: "userId" }),
        accounts: hasMany("account", { foreignKey: "userId" }),
        organizations: manyToMany("organization", {
          through: "member",
          from: "userId",
          to: "organizationId",
        }),
      },
    }),
    profile: model({
      table: `${prefix}_profiles`,
      fields: {
        id: id().map("_id"),
        userId: string().unique().references("user.id").map("user_id"),
        bio: string().nullable(),
      },
      relations: {
        user: belongsTo("user", { foreignKey: "userId" }),
      },
    }),
    session: model({
      table: `${prefix}_sessions`,
      fields: {
        id: id().map("_id"),
        userId: string().references("user.id").map("user_id"),
        token: string().unique(),
        expiresAt: datetime().map("expires_at"),
      },
      constraints: {
        indexes: [["userId", "expiresAt"]],
      },
      relations: {
        user: belongsTo("user", { foreignKey: "userId" }),
      },
    }),
    account: model({
      table: `${prefix}_accounts`,
      fields: {
        id: id().map("_id"),
        userId: string().references("user.id").map("user_id"),
        provider: string(),
        accountId: string().map("account_id"),
        planTier: enumeration(["oss", "pro", "enterprise"]).default("oss").map("plan_tier"),
        balance: decimal().default("0.00"),
        metadata: json<{
          plan: string;
          scopes: string[];
          flags: { sync: boolean };
        } | null>().nullable(),
      },
      constraints: {
        unique: [["provider", "accountId"]],
        indexes: [["userId", "provider"]],
      },
      relations: {
        user: belongsTo("user", { foreignKey: "userId" }),
      },
    }),
    organization: model({
      table: `${prefix}_organizations`,
      fields: {
        id: id().map("_id"),
        name: string().unique(),
        slug: string().unique(),
      },
      relations: {
        users: manyToMany("user", {
          through: "member",
          from: "organizationId",
          to: "userId",
        }),
      },
    }),
    member: model({
      table: `${prefix}_members`,
      fields: {
        id: id().map("_id"),
        userId: string().references("user.id").map("user_id"),
        organizationId: string().references("organization.id").map("organization_id"),
        role: string(),
      },
      constraints: {
        unique: [["userId", "organizationId"]],
        indexes: [["organizationId", "role"]],
      },
      relations: {
        user: belongsTo("user", { foreignKey: "userId" }),
        organization: belongsTo("organization", { foreignKey: "organizationId" }),
      },
    }),
  });
}

export function createRealGeneratedNumericSchema(prefix: string) {
  return defineSchema({
    auditEvent: model({
      table: `${prefix}_audit_events`,
      fields: {
        id: id({ type: "integer", generated: "increment" }),
        email: string().unique(),
      },
    }),
  });
}

export function createRealNamespacedSchema(prefix: string) {
  return defineSchema({
    user: model({
      table: tableName("users", { schema: `${prefix}_auth` }),
      fields: {
        id: id(),
        email: string().unique(),
      },
    }),
  });
}

export async function cleanupRealXataSchema(client: XataClientLike, schema: SchemaDefinition<any>) {
  const manifest = createManifest(schema);
  const tables = Object.values(manifest.models);
  const schemas = [...new Set(tables.map((model) => model.schema).filter(Boolean))];

  for (const model of [...tables].reverse()) {
    if (model.schema) {
      continue;
    }

    await runXataStatement(
      client,
      `drop table if exists ${qualifiedTableName(model)} cascade`,
    ).catch(() => undefined);
  }

  for (const schemaName of schemas) {
    await runXataStatement(
      client,
      `drop schema if exists ${quoteIdentifier(schemaName!)} cascade`,
    ).catch(() => undefined);
  }
}

export type { RealXataClient };
