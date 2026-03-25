import { randomUUID } from "node:crypto";

export function createIsolatedName(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function assignDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function assignMongoDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function formatLocalRuntimeError(label: string, error: unknown, hint: string) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${label} demo runtime could not connect. ${hint}\nOriginal error: ${message}`);
}

export function toDirectCheck(
  row?: { id?: string | null; email?: string | null; email_address?: string | null } | null,
) {
  if (!row?.id) return null;
  return {
    id: row.id,
    email: row.email ?? row.email_address ?? "",
  };
}

export async function applyStatements(
  execute: (statement: string) => Promise<unknown> | unknown,
  sql: string,
) {
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await execute(`${statement};`);
  }
}
