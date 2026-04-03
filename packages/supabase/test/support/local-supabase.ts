import type { SupabaseClientLike, SupabaseQueryResponse, SupabaseTableClientLike } from "../../src";

type TableState = {
  rows: Array<Record<string, unknown>>;
  nextIntegerId: number;
};

type QueryAction = "select" | "insert" | "update" | "delete";

type QueryState = {
  schema: string;
  table: string;
  action: QueryAction;
  filters: Array<{ column: string; value: unknown }>;
  payload?: Record<string, unknown> | Array<Record<string, unknown>>;
  from?: number;
  to?: number;
  limit?: number;
  orderBy?: { column: string; ascending: boolean };
  returnRows: boolean;
  single: boolean;
};

function tableKey(schema: string, table: string) {
  return `${schema}:${table}`;
}

function cloneRow(row: Record<string, unknown>) {
  return structuredClone(row);
}

function cloneOptionalRow(row: Record<string, unknown> | null | undefined) {
  return row ? cloneRow(row) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function createTableBuilder(
  tables: Map<string, TableState>,
  state: QueryState,
): SupabaseTableClientLike {
  const resolveTable = () => {
    const key = tableKey(state.schema, state.table);
    const existing = tables.get(key);
    if (existing) {
      return existing;
    }

    const next: TableState = {
      rows: [],
      nextIntegerId: 1,
    };
    tables.set(key, next);
    return next;
  };

  const applyFilters = (rows: Array<Record<string, unknown>>) =>
    rows.filter((row) =>
      state.filters.every((filter) => Object.is(row[filter.column], filter.value)),
    );

  const applyOrdering = (rows: Array<Record<string, unknown>>) => {
    if (!state.orderBy) {
      return rows;
    }

    const { column, ascending } = state.orderBy;
    return [...rows].sort((left, right) => {
      const a = left[column];
      const b = right[column];
      if (Object.is(a, b)) return 0;
      if (a === undefined) return ascending ? -1 : 1;
      if (b === undefined) return ascending ? 1 : -1;
      if (a == null) return ascending ? -1 : 1;
      if (b == null) return ascending ? 1 : -1;
      if (a < b) return ascending ? -1 : 1;
      if (a > b) return ascending ? 1 : -1;
      return 0;
    });
  };

  const applySlice = (rows: Array<Record<string, unknown>>) => {
    const rangeStart = state.from ?? 0;
    const rangeEnd = state.to === undefined ? undefined : state.to + 1;
    const ranged = rows.slice(rangeStart, rangeEnd);

    if (state.limit === undefined) {
      return ranged;
    }

    return ranged.slice(0, state.limit);
  };

  const execute = async (): Promise<SupabaseQueryResponse<unknown>> => {
    const table = resolveTable();

    if (state.action === "select") {
      const matched = applySlice(applyOrdering(applyFilters(table.rows)));
      if (state.single) {
        return {
          data: cloneOptionalRow(matched[0]),
          error: null,
        };
      }

      return {
        data: matched.map(cloneRow),
        error: null,
      };
    }

    if (state.action === "insert") {
      const entries = Array.isArray(state.payload) ? state.payload : [state.payload ?? {}];
      const inserted = entries.map((entry) => {
        const row = cloneRow(entry);
        if (!("id" in row)) {
          row.id = table.nextIntegerId;
          table.nextIntegerId += 1;
        } else if (typeof row.id === "number" && row.id >= table.nextIntegerId) {
          table.nextIntegerId = row.id + 1;
        }

        table.rows.push(row);
        return row;
      });

      if (state.single) {
        return {
          data: cloneOptionalRow(inserted[0]),
          error: null,
        };
      }

      return {
        data: state.returnRows ? inserted.map(cloneRow) : null,
        error: null,
      };
    }

    if (state.action === "update") {
      const matched = applyFilters(table.rows);
      const updated = matched.map((row) => {
        Object.assign(row, cloneRow((state.payload as Record<string, unknown>) ?? {}));
        return cloneRow(row);
      });

      if (state.single) {
        return {
          data: cloneOptionalRow(updated[0]),
          error: null,
        };
      }

      return {
        data: state.returnRows ? updated : null,
        error: null,
      };
    }

    const matched = applyFilters(table.rows);
    const remaining = table.rows.filter(
      (row) => !matched.some((candidate) => Object.is(candidate, row)),
    );
    table.rows = remaining;

    if (state.single) {
      return {
        data: cloneOptionalRow(matched[0]),
        error: null,
      };
    }

    return {
      data: state.returnRows ? matched.map(cloneRow) : null,
      error: null,
    };
  };

  const builder = {} as SupabaseTableClientLike;

  builder.select = (_columns?: string) => {
    if (state.action === "select") {
      state.action = "select";
    } else {
      state.returnRows = true;
    }
    return builder;
  };

  builder.insert = (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
    state.action = "insert";
    state.payload = values;
    return builder;
  };

  builder.update = (values: Record<string, unknown>) => {
    state.action = "update";
    state.payload = values;
    return builder;
  };

  builder.upsert = (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
    state.action = "insert";
    state.payload = values;
    return builder;
  };

  builder.delete = () => {
    state.action = "delete";
    return builder;
  };

  builder.eq = (column: string, value: unknown) => {
    state.filters.push({ column, value });
    return builder;
  };

  builder.order = (column: string, options?: { ascending?: boolean }) => {
    state.orderBy = {
      column,
      ascending: options?.ascending !== false,
    };
    return builder;
  };

  builder.range = (from: number, to: number) => {
    state.from = from;
    state.to = to;
    return builder;
  };

  builder.limit = (count: number) => {
    state.limit = count;
    return builder;
  };

  builder.maybeSingle = () => {
    state.single = true;
    return builder;
  };

  builder.single = () => {
    state.single = true;
    return builder;
  };

  builder.then = ((onfulfilled, onrejected) =>
    execute().then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    )) as SupabaseTableClientLike["then"];

  return builder;
}

export function createInMemorySupabaseClient(): SupabaseClientLike {
  const tables = new Map<string, TableState>();

  const createSchemaClient = (schemaName: string) =>
    ({
      from(table: string) {
        return createTableBuilder(tables, {
          schema: schemaName,
          table,
          action: "select",
          filters: [],
          returnRows: true,
          single: false,
        });
      },
    }) satisfies { from(table: string): SupabaseTableClientLike };

  const client = {
    ...createSchemaClient("public"),
    schema(name: string) {
      return createSchemaClient(name);
    },
    async rpc() {
      return {
        data: null,
        error: null,
      };
    },
    auth: {},
    storage: {},
    functions: {},
    realtime: {},
  } satisfies SupabaseClientLike;

  return client;
}

export async function startLocalSupabase() {
  return {
    client: createInMemorySupabaseClient(),
    close: async () => {},
  };
}
