import { DataType, newDb } from "pg-mem";

export type LocalEdgeDbClient = {
  querySQL(sql: string, args?: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
  executeSQL(sql: string, args?: readonly unknown[]): Promise<void>;
  transaction<TResult>(run: (client: LocalEdgeDbClient) => Promise<TResult>): Promise<TResult>;
};

export type LocalEdgeDbHarness = {
  client: LocalEdgeDbClient;
  applySql(sql: string): Promise<void>;
  close(): Promise<void>;
};

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    const next = sql[index + 1];

    current += char;

    if (quote === "'") {
      if ((char === "'" || char === "\\") && next === "'") {
        current += next;
        index += 1;
        continue;
      }

      if (char === "'") {
        quote = null;
      }

      continue;
    }

    if (quote === '"') {
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
        continue;
      }

      if (char === '"') {
        quote = null;
      }

      continue;
    }

    if (quote === "`") {
      if ((char === "`" || char === "\\") && next === "`") {
        current += next;
        index += 1;
        continue;
      }

      if (char === "`") {
        quote = null;
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
    }
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing.endsWith(";") ? trailing : `${trailing};`);
  }

  return statements.map((statement) => statement.replace(/;+$/g, ""));
}

export async function startLocalEdgeDb(): Promise<LocalEdgeDbHarness> {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  db.public.registerFunction({
    name: "strpos",
    args: [DataType.text, DataType.text],
    returns: DataType.integer,
    implementation: (value: string, needle: string) => {
      const index = String(value).indexOf(String(needle));
      return index >= 0 ? index + 1 : 0;
    },
  });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const createClient = (): LocalEdgeDbClient => ({
    async querySQL(sql, args = []) {
      const result = await pool.query(sql, args);
      return result.rows;
    },
    async executeSQL(sql, args = []) {
      await pool.query(sql, args);
    },
    async transaction(run) {
      const snapshot = db.backup();
      try {
        return await run(createClient());
      } catch (error) {
        snapshot.restore();
        throw error;
      }
    },
  });

  return {
    client: createClient(),
    async applySql(sql) {
      const client = await pool.connect();
      try {
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement);
        }
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
