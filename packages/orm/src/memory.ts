import { randomUUID } from "node:crypto";
import type {
  CreateArgs,
  DeleteArgs,
  FindFirstArgs,
  FindManyArgs,
  OrmDriver,
  SelectShape,
  SelectedRecord,
  UpdateArgs,
  Where,
} from "./client";
import type { SchemaDefinition } from "./schema";
import type { ModelName, RelationName, ScalarRecord } from "./schema";

type MemoryStore<TSchema extends SchemaDefinition<any>> = Partial<
  Record<ModelName<TSchema>, Array<Record<string, unknown>>>
>;

const isDate = (value: unknown): value is Date => value instanceof Date;

function evaluateFilter(value: unknown, filter: unknown) {
  if (
    filter === undefined ||
    filter === null ||
    typeof filter !== "object" ||
    isDate(filter) ||
    Array.isArray(filter)
  ) {
    return value === filter;
  }

  const record = filter as Record<string, unknown>;

  if ("eq" in record && value !== record.eq) return false;
  if ("not" in record && value === record.not) return false;
  if ("in" in record) {
    const values = Array.isArray(record.in) ? record.in : [];
    if (!values.includes(value)) return false;
  }
  if ("contains" in record) {
    if (typeof value !== "string" || typeof record.contains !== "string") return false;
    if (!value.includes(record.contains)) return false;
  }
  if ("gt" in record && value !== undefined) {
    if (!(value instanceof Date || typeof value === "number" || typeof value === "string")) {
      return false;
    }
    if (!(value > record.gt!)) return false;
  }
  if ("gte" in record && value !== undefined) {
    if (!(value instanceof Date || typeof value === "number" || typeof value === "string")) {
      return false;
    }
    if (!(value >= record.gte!)) return false;
  }
  if ("lt" in record && value !== undefined) {
    if (!(value instanceof Date || typeof value === "number" || typeof value === "string")) {
      return false;
    }
    if (!(value < record.lt!)) return false;
  }
  if ("lte" in record && value !== undefined) {
    if (!(value instanceof Date || typeof value === "number" || typeof value === "string")) {
      return false;
    }
    if (!(value <= record.lte!)) return false;
  }

  return true;
}

function matchesWhere<TRecord extends Record<string, unknown>>(
  record: TRecord,
  where?: Where<any>,
) {
  if (!where) return true;

  if (where.AND && !where.AND.every((clause: Where<any>) => matchesWhere(record, clause))) {
    return false;
  }

  if (where.OR && !where.OR.some((clause: Where<any>) => matchesWhere(record, clause))) {
    return false;
  }

  if (where.NOT && matchesWhere(record, where.NOT)) {
    return false;
  }

  for (const [key, filter] of Object.entries(where)) {
    if (key === "AND" || key === "OR" || key === "NOT") continue;
    if (!evaluateFilter(record[key], filter)) return false;
  }

  return true;
}

function applyDefault(value: unknown, field: { generated?: string; defaultValue?: unknown }) {
  if (value !== undefined) return value;

  if (field.generated === "id") return randomUUID();
  if (field.generated === "now") return new Date();

  if (typeof field.defaultValue === "function") {
    return (field.defaultValue as () => unknown)();
  }

  return field.defaultValue;
}

function sortRows(
  rows: Array<Record<string, unknown>>,
  orderBy?: Partial<Record<string, "asc" | "desc">>,
) {
  if (!orderBy) return rows;
  const entries = Object.entries(orderBy);
  if (!entries.length) return rows;

  return [...rows].sort((left, right) => {
    for (const [field, direction] of entries) {
      const a = left[field];
      const b = right[field];
      if (a === b) continue;
      if (a === undefined) return direction === "asc" ? -1 : 1;
      if (b === undefined) return direction === "asc" ? 1 : -1;
      if (a == null) return direction === "asc" ? -1 : 1;
      if (b == null) return direction === "asc" ? 1 : -1;
      if (a < b) return direction === "asc" ? -1 : 1;
      if (a > b) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

function pageRows(
  rows: Array<Record<string, unknown>>,
  skip?: number,
  take?: number,
) {
  const start = skip ?? 0;
  const end = take === undefined ? undefined : start + take;
  return rows.slice(start, end);
}

export function createMemoryDriver<TSchema extends SchemaDefinition<any>>(
  seed?: MemoryStore<TSchema>,
): OrmDriver<TSchema> {
  const state: MemoryStore<TSchema> = structuredClone(seed ?? {});

  function getRows<TModelName extends ModelName<TSchema>>(model: TModelName) {
    const rows = state[model] ?? [];
    state[model] = rows;
    return rows;
  }

  function applyQuery<TModelName extends ModelName<TSchema>>(
    model: TModelName,
    args:
      | FindManyArgs<TSchema, TModelName, any>
      | FindFirstArgs<TSchema, TModelName, any>,
  ) {
    const rows = getRows(model);
    const filtered = rows.filter((row) => matchesWhere(row, args.where));
    const sorted = sortRows(filtered, args.orderBy as Partial<Record<string, "asc" | "desc">> | undefined);
    return pageRows(sorted, args.skip, args.take);
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined
  >(
    schema: TSchema,
    model: TModelName,
    row: Record<string, unknown>,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const modelDefinition = schema.models[model];
    const output: Record<string, unknown> = {};

    if (!select) {
      for (const fieldName of Object.keys(modelDefinition.fields)) {
        output[fieldName] = row[fieldName];
      }
      return output as SelectedRecord<TSchema, TModelName, TSelect>;
    }

    for (const [key, value] of Object.entries(select)) {
      if (value !== true && value === undefined) continue;

      if (key in modelDefinition.fields && value === true) {
        output[key] = row[key];
        continue;
      }

      if (key in modelDefinition.relations) {
        output[key] = await resolveRelation(
          schema,
          model,
          key as RelationName<TSchema, TModelName>,
          row,
          value as true | FindManyArgs<TSchema, any, any>,
        );
      }
    }

    return output as SelectedRecord<TSchema, TModelName, TSelect>;
  }

  async function resolveRelation<
    TModelName extends ModelName<TSchema>,
    TRelationName extends RelationName<TSchema, TModelName>
  >(
    schema: TSchema,
    model: TModelName,
    relationName: TRelationName,
    row: Record<string, unknown>,
    value: true | FindManyArgs<TSchema, any, any>,
  ) {
    const relation = schema.models[model].relations[relationName];
    const relationArgs = value === true ? {} : value;

    if (relation.kind === "belongsTo") {
      const targetRows = getRows(relation.target as ModelName<TSchema>);
      const foreignValue = row[relation.foreignKey];
      const target = targetRows.find((item) => item.id === foreignValue);
      return target
        ? projectRow(
            schema,
            relation.target as ModelName<TSchema>,
            target,
            relationArgs.select,
          )
        : null;
    }

    if (relation.kind === "hasOne") {
      const targetRows = getRows(relation.target as ModelName<TSchema>);
      const target = targetRows.find((item) => item[relation.foreignKey] === row.id);
      return target
        ? projectRow(
            schema,
            relation.target as ModelName<TSchema>,
            target,
            relationArgs.select,
          )
        : null;
    }

    if (relation.kind === "hasMany") {
      const targetRows = getRows(relation.target as ModelName<TSchema>).filter(
        (item) => item[relation.foreignKey] === row.id,
      );
      const sorted = sortRows(
        targetRows,
        relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
      );
      const paged = pageRows(sorted, relationArgs.skip, relationArgs.take);
      const filtered = paged.filter((item) => matchesWhere(item, relationArgs.where));
      return Promise.all(
        filtered.map((item) =>
          projectRow(
            schema,
            relation.target as ModelName<TSchema>,
            item,
            relationArgs.select,
          ),
        ),
      );
    }

    const throughRows = getRows(relation.through as ModelName<TSchema>).filter(
      (item) => item[relation.from] === row.id,
    );
    const targetIds = throughRows.map((item) => item[relation.to]);
    const targetRows = getRows(relation.target as ModelName<TSchema>).filter((item) =>
      targetIds.includes(item.id),
    );
    const sorted = sortRows(
      targetRows,
      relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
    );
    const paged = pageRows(sorted, relationArgs.skip, relationArgs.take);
    const filtered = paged.filter((item) => matchesWhere(item, relationArgs.where));

    return Promise.all(
      filtered.map((item) =>
        projectRow(
          schema,
          relation.target as ModelName<TSchema>,
          item,
          relationArgs.select,
        ),
      ),
    );
  }

  const driver = {
    async findMany(
      schema: TSchema,
      model: ModelName<TSchema>,
      args: FindManyArgs<TSchema, ModelName<TSchema>, any>,
    ) {
      const rows = applyQuery(model, args);
      return Promise.all(
        rows.map((row) => projectRow(schema, model, row, args.select)),
      );
    },
    async findFirst(
      schema: TSchema,
      model: ModelName<TSchema>,
      args: FindFirstArgs<TSchema, ModelName<TSchema>, any>,
    ) {
      const row = applyQuery(model, args)[0];
      if (!row) return null;
      return projectRow(schema, model, row, args.select);
    },
    async create(
      schema: TSchema,
      model: ModelName<TSchema>,
      args: CreateArgs<TSchema, ModelName<TSchema>, any>,
    ) {
      const modelDefinition = schema.models[model];
      const nextRow: Record<string, unknown> = {};
      for (const [fieldName, field] of Object.entries(modelDefinition.fields) as Array<
        [string, (typeof modelDefinition.fields)[string]]
      >) {
        nextRow[fieldName] = applyDefault(args.data[fieldName], field.config);
      }

      getRows(model).push(nextRow);
      return projectRow(schema, model, nextRow, args.select);
    },
    async update(
      schema: TSchema,
      model: ModelName<TSchema>,
      args: UpdateArgs<TSchema, ModelName<TSchema>, any>,
    ) {
      const rows = getRows(model);
      const row = rows.find((item) => matchesWhere(item, args.where));
      if (!row) return null;
      Object.assign(row, args.data);
      return projectRow(schema, model, row, args.select);
    },
    async delete(
      _schema: TSchema,
      model: ModelName<TSchema>,
      args: DeleteArgs<TSchema, ModelName<TSchema>>,
    ) {
      const rows = getRows(model);
      const before = rows.length;
      state[model] = rows.filter((item) => !matchesWhere(item, args.where));
      return before - (state[model]?.length ?? 0);
    },
    async transaction<TResult>(
      _schema: TSchema,
      run: (driver: OrmDriver<TSchema>) => Promise<TResult>,
    ) {
      const snapshot = structuredClone(state);
      try {
        return await run(driver);
      } catch (error) {
        Object.keys(state).forEach((key) => {
          delete state[key as ModelName<TSchema>];
        });
        Object.assign(state, snapshot);
        throw error;
      }
    },
  } as OrmDriver<TSchema>;

  return driver;
}
