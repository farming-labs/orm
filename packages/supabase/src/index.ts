import {
  createDriverHandle,
  createManifest,
  equalValues,
  isOperatorFilterObject,
  mergeUniqueLookupCreateData,
  requireUniqueLookup,
  validateUniqueLookupUpdateData,
  type CountArgs,
  type CreateArgs,
  type CreateManyArgs,
  type DeleteArgs,
  type DeleteManyArgs,
  type FindFirstArgs,
  type FindManyArgs,
  type FindUniqueArgs,
  type ManifestField,
  type ManifestModel,
  type ModelName,
  type OrmDriver,
  type OrmDriverHandle,
  type RelationName,
  type SchemaDefinition,
  type SchemaManifest,
  type SelectShape,
  type SelectedRecord,
  type UpdateArgs,
  type UpdateManyArgs,
  type UpsertArgs,
  type Where,
} from "@farming-labs/orm";

type SupabaseRow = Record<string, unknown>;
type SupabaseWhere = Where<Record<string, unknown>>;
type SupabaseSort = Partial<Record<string, "asc" | "desc">>;

export type SupabaseQueryResponse<T> = {
  data: T | null;
  error: unknown | null;
  count?: number | null;
};

export type SupabaseTableClientLike = PromiseLike<SupabaseQueryResponse<unknown>> & {
  select(columns?: string, options?: Record<string, unknown>): SupabaseTableClientLike;
  insert(
    values: SupabaseRow | SupabaseRow[],
    options?: Record<string, unknown>,
  ): SupabaseTableClientLike;
  update(values: SupabaseRow, options?: Record<string, unknown>): SupabaseTableClientLike;
  upsert(
    values: SupabaseRow | SupabaseRow[],
    options?: Record<string, unknown>,
  ): SupabaseTableClientLike;
  delete(options?: Record<string, unknown>): SupabaseTableClientLike;
  eq(column: string, value: unknown): SupabaseTableClientLike;
  order?(column: string, options?: { ascending?: boolean }): SupabaseTableClientLike;
  range?(from: number, to: number): SupabaseTableClientLike;
  limit?(count: number): SupabaseTableClientLike;
  maybeSingle?(): SupabaseTableClientLike;
  single?(): SupabaseTableClientLike;
};

export type SupabaseSchemaClientLike = {
  from(table: string): SupabaseTableClientLike;
};

export type SupabaseClientLike = SupabaseSchemaClientLike & {
  schema?(name: string): SupabaseSchemaClientLike;
  rpc?(fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>): unknown;
  auth?: unknown;
  storage?: unknown;
  functions?: unknown;
  realtime?: unknown;
};

export type SupabaseFieldTransform = {
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
};

export type SupabaseDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: SupabaseClientLike;
  transforms?: Partial<Record<string, Partial<Record<string, SupabaseFieldTransform>>>>;
};

export type SupabaseDriverHandle<TSchema extends SchemaDefinition<any>> = OrmDriverHandle<
  "supabase",
  {
    client: SupabaseClientLike;
  },
  "postgres"
>;

type LoadedRow = {
  docId: string;
  data: SupabaseRow;
  stored: SupabaseRow;
};

type BuiltRow = {
  docId?: string;
  stored: SupabaseRow;
  decoded: SupabaseRow;
};

const manifestCache = new WeakMap<object, SchemaManifest>();

function generateUuid() {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return randomUuid.call(globalThis.crypto);
  }

  throw new Error("The current runtime does not provide crypto.randomUUID().");
}

function getManifest(schema: SchemaDefinition<any>) {
  const cached = manifestCache.get(schema);
  if (cached) return cached;
  const next = createManifest(schema);
  manifestCache.set(schema, next);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasFunction<TName extends string>(
  value: unknown,
  name: TName,
): value is Record<TName, (...args: any[]) => unknown> {
  return isRecord(value) && typeof value[name] === "function";
}

function normalizeDecimalString(value: string) {
  const trimmed = value.trim();
  const match = /^(-?\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  const [, integerPart, fractionalPart] = match;
  if (!fractionalPart) {
    return integerPart;
  }

  const normalizedFraction = fractionalPart.replace(/0+$/g, "");
  return normalizedFraction.length ? `${integerPart}.${normalizedFraction}` : integerPart;
}

function applyDefault(value: unknown, field: ManifestField) {
  if (value !== undefined) return value;
  if (field.generated === "id") return generateUuid();
  if (field.generated === "now") return new Date();
  if (typeof field.defaultValue === "function") {
    return (field.defaultValue as () => unknown)();
  }
  return field.defaultValue;
}

function isComparable(value: unknown) {
  return (
    value instanceof Date ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "bigint"
  );
}

function evaluateFilter(value: unknown, filter: unknown) {
  if (!isOperatorFilterObject(filter)) {
    return equalValues(value, filter);
  }

  if ("eq" in filter && !equalValues(value, filter.eq)) return false;
  if ("not" in filter && equalValues(value, filter.not)) return false;
  if ("in" in filter) {
    const values = Array.isArray(filter.in) ? filter.in : [];
    if (!values.some((candidate) => equalValues(candidate, value))) return false;
  }
  if ("contains" in filter) {
    if (typeof value !== "string" || typeof filter.contains !== "string") return false;
    if (!value.includes(filter.contains)) return false;
  }
  if ("gt" in filter) {
    if (!isComparable(value) || value <= filter.gt!) return false;
  }
  if ("gte" in filter) {
    if (!isComparable(value) || value < filter.gte!) return false;
  }
  if ("lt" in filter) {
    if (!isComparable(value) || value >= filter.lt!) return false;
  }
  if ("lte" in filter) {
    if (!isComparable(value) || value > filter.lte!) return false;
  }

  return true;
}

function sortRows(rows: LoadedRow[], orderBy?: SupabaseSort) {
  if (!orderBy) return rows;
  const entries = Object.entries(orderBy);
  if (!entries.length) return rows;

  return [...rows].sort((left, right) => {
    for (const [field, direction] of entries) {
      const a = left.data[field];
      const b = right.data[field];
      if (equalValues(a, b)) continue;
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

function pageRows(rows: LoadedRow[], skip?: number, take?: number) {
  const start = skip ?? 0;
  const end = take === undefined ? undefined : start + take;
  return rows.slice(start, end);
}

function supabaseConstraintError(target?: string | string[]) {
  const fields = Array.isArray(target) ? target.join(", ") : (target ?? "unique fields");
  const error = new Error(`Supabase unique constraint violation on ${fields}.`);
  Object.assign(error, {
    name: "SupabaseUniqueConstraintError",
    code: "23505",
    details: `Key (${fields}) already exists.`,
    target,
  });
  return error;
}

async function executeQuery<T>(builder: unknown): Promise<SupabaseQueryResponse<T>> {
  const result = (await Promise.resolve(
    builder as PromiseLike<SupabaseQueryResponse<T>> | SupabaseQueryResponse<T>,
  )) as SupabaseQueryResponse<T>;

  if (!isRecord(result) || !("data" in result) || !("error" in result)) {
    throw new Error("The Supabase runtime client returned an unexpected response shape.");
  }

  if (result.error) {
    throw result.error;
  }

  return result;
}

function normalizeResponseRows<T extends SupabaseRow>(response: SupabaseQueryResponse<T[] | T>) {
  const data = response.data;

  if (data === null || data === undefined) {
    return [] as T[];
  }

  if (Array.isArray(data)) {
    return data.filter((entry): entry is T => isRecord(entry));
  }

  return isRecord(data) ? [data as T] : [];
}

function stripUndefinedValues(record: SupabaseRow) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function createSupabaseDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: SupabaseDriverConfig<TSchema>,
): OrmDriver<TSchema, SupabaseDriverHandle<TSchema>> {
  function getSupportedManifest(schema: TSchema) {
    return getManifest(schema);
  }

  function fieldTransform(modelName: string, fieldName: string) {
    return config.transforms?.[modelName]?.[fieldName];
  }

  function encodeValue(modelName: string, field: ManifestField, value: unknown) {
    if (value === undefined) return value;
    if (value === null) return null;

    const transform = fieldTransform(modelName, field.name);
    if (transform?.encode) {
      return transform.encode(value);
    }

    if (field.kind === "id" && field.idType === "integer") {
      return Number(value);
    }

    if (field.kind === "enum") {
      return String(value);
    }

    if (field.kind === "boolean") {
      return Boolean(value);
    }

    if (field.kind === "integer") {
      return Number(value);
    }

    if (field.kind === "bigint") {
      return typeof value === "bigint"
        ? value.toString()
        : BigInt(value as string | number).toString();
    }

    if (field.kind === "decimal") {
      return typeof value === "string" ? normalizeDecimalString(value) : String(value);
    }

    if (field.kind === "datetime") {
      if (value instanceof Date) return value.toISOString();
      return new Date(value as string | number).toISOString();
    }

    return value;
  }

  function decodeValue(modelName: string, field: ManifestField, value: unknown) {
    const transform = fieldTransform(modelName, field.name);
    if (transform?.decode) {
      return transform.decode(value);
    }

    if (value === undefined || value === null) return value ?? null;

    if (field.kind === "id" && field.idType === "integer") {
      return Number(value);
    }

    if (field.kind === "enum") {
      return String(value);
    }

    if (field.kind === "boolean") {
      return Boolean(value);
    }

    if (field.kind === "integer") {
      return Number(value);
    }

    if (field.kind === "bigint") {
      return typeof value === "bigint" ? value : BigInt(value as string | number);
    }

    if (field.kind === "decimal") {
      return normalizeDecimalString(String(value));
    }

    if (field.kind === "datetime") {
      return value instanceof Date ? value : new Date(value as string | number);
    }

    return value;
  }

  function modelTable(model: ManifestModel) {
    if (model.schema) {
      if (hasFunction(config.client, "schema")) {
        return config.client.schema(model.schema).from(model.table);
      }

      return config.client.from(`${model.schema}.${model.table}`);
    }

    return config.client.from(model.table);
  }

  function normalizeFilterValue(model: ManifestModel, fieldName: string, value: unknown) {
    const field = model.fields[fieldName];
    if (!field || value === undefined || value === null) {
      return value;
    }

    return decodeValue(model.name, field, encodeValue(model.name, field, value));
  }

  function evaluateModelFilter(
    model: ManifestModel,
    fieldName: string,
    value: unknown,
    filter: unknown,
  ) {
    if (!isOperatorFilterObject(filter)) {
      return equalValues(value, normalizeFilterValue(model, fieldName, filter));
    }

    const normalized = {
      ...(filter.eq !== undefined ? { eq: normalizeFilterValue(model, fieldName, filter.eq) } : {}),
      ...(filter.not !== undefined
        ? { not: normalizeFilterValue(model, fieldName, filter.not) }
        : {}),
      ...(filter.in !== undefined
        ? {
            in: (Array.isArray(filter.in) ? filter.in : []).map((entry) =>
              normalizeFilterValue(model, fieldName, entry),
            ),
          }
        : {}),
      ...(filter.contains !== undefined ? { contains: String(filter.contains) } : {}),
      ...(filter.gt !== undefined ? { gt: normalizeFilterValue(model, fieldName, filter.gt) } : {}),
      ...(filter.gte !== undefined
        ? { gte: normalizeFilterValue(model, fieldName, filter.gte) }
        : {}),
      ...(filter.lt !== undefined ? { lt: normalizeFilterValue(model, fieldName, filter.lt) } : {}),
      ...(filter.lte !== undefined
        ? { lte: normalizeFilterValue(model, fieldName, filter.lte) }
        : {}),
    };

    return evaluateFilter(value, normalized);
  }

  function matchesModelWhere(model: ManifestModel, record: SupabaseRow, where?: SupabaseWhere) {
    if (!where) return true;

    if (where.AND && !where.AND.every((clause) => matchesModelWhere(model, record, clause))) {
      return false;
    }

    if (where.OR && !where.OR.some((clause) => matchesModelWhere(model, record, clause))) {
      return false;
    }

    if (where.NOT && matchesModelWhere(model, record, where.NOT)) {
      return false;
    }

    for (const [key, filter] of Object.entries(where)) {
      if (key === "AND" || key === "OR" || key === "NOT") continue;
      if (!evaluateModelFilter(model, key, record[key], filter)) return false;
    }

    return true;
  }

  function applyModelQuery(
    model: ManifestModel,
    rows: LoadedRow[],
    args: {
      where?: SupabaseWhere;
      orderBy?: SupabaseSort;
      skip?: number;
      take?: number;
    } = {},
  ) {
    const filtered = rows.filter((row) => matchesModelWhere(model, row.data, args.where));
    const sorted = sortRows(filtered, args.orderBy);
    return pageRows(sorted, args.skip, args.take);
  }

  function buildLoadedRow(model: ManifestModel, stored: SupabaseRow): LoadedRow {
    const decoded: SupabaseRow = {};

    for (const field of Object.values(model.fields)) {
      decoded[field.name] = decodeValue(model.name, field, stored[field.column]);
    }

    const docId = decoded.id;
    if (docId === undefined || docId === null) {
      throw new Error(`Supabase row for model "${model.name}" is missing an id value.`);
    }

    return {
      docId: String(docId),
      data: decoded,
      stored,
    };
  }

  async function loadRows<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
  ) {
    const model = getSupportedManifest(schema).models[modelName];
    const pageSize = 1000;
    const storedRows: SupabaseRow[] = [];
    let offset = 0;

    while (true) {
      let query = modelTable(model).select("*");
      if (hasFunction(query, "range")) {
        query = query.range(offset, offset + pageSize - 1);
      } else if (hasFunction(query, "limit")) {
        query = query.limit(pageSize);
      }

      const response = await executeQuery<SupabaseRow[] | SupabaseRow>(query);
      const page = normalizeResponseRows(response);
      storedRows.push(...page);

      if (!hasFunction(query, "range") || page.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return storedRows.map((row) => buildLoadedRow(model, row));
  }

  function buildStoredRow(model: ManifestModel, data: Partial<Record<string, unknown>>): BuiltRow {
    const stored: SupabaseRow = {};
    const decoded: SupabaseRow = {};

    for (const field of Object.values(model.fields)) {
      const currentValue = applyDefault(data[field.name], field);

      if (
        field.kind === "id" &&
        field.idType === "integer" &&
        field.generated === "increment" &&
        (currentValue === undefined || currentValue === null)
      ) {
        continue;
      }

      if (currentValue === undefined) continue;
      const encoded = encodeValue(model.name, field, currentValue);
      stored[field.column] = encoded;
      decoded[field.name] = decodeValue(model.name, field, encoded);
    }

    const idField = model.fields.id;
    if (!idField) {
      return {
        stored,
        decoded,
      };
    }

    let idValue = decoded[idField.name];

    if (idValue === undefined || idValue === null) {
      if (idField.idType === "integer" && idField.generated === "increment") {
        return {
          stored,
          decoded,
        };
      }

      if (idField.idType === "integer") {
        throw new Error(
          `The Supabase runtime requires an explicit numeric id for model "${model.name}" when using manual integer ids.`,
        );
      }

      idValue = generateUuid();
      const encodedId = encodeValue(model.name, idField, idValue);
      stored[idField.column] = encodedId;
      decoded[idField.name] = decodeValue(model.name, idField, encodedId);
      idValue = decoded[idField.name];
    }

    return {
      docId: String(idValue),
      stored,
      decoded,
    };
  }

  function buildUpdatedRow(
    model: ManifestModel,
    current: LoadedRow,
    data: Partial<Record<string, unknown>>,
  ): BuiltRow {
    const stored = {
      ...current.stored,
    };
    const decoded = {
      ...current.data,
    };

    for (const [fieldName, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const field = model.fields[fieldName];
      if (!field) {
        throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
      }

      if (field.name === "id" && !equalValues(current.data.id, value)) {
        throw new Error(
          `The Supabase runtime does not support updating the id field for model "${model.name}".`,
        );
      }

      const encoded = encodeValue(model.name, field, value);
      stored[field.column] = encoded;
      decoded[field.name] = decodeValue(model.name, field, encoded);
    }

    return {
      docId: current.docId,
      stored,
      decoded,
    };
  }

  async function insertStoredRow(model: ManifestModel, row: BuiltRow): Promise<LoadedRow> {
    const query = modelTable(model).insert(stripUndefinedValues(row.stored)).select("*");
    const response = await executeQuery<SupabaseRow[] | SupabaseRow>(query);
    const inserted = normalizeResponseRows(response)[0];

    if (!inserted) {
      throw new Error(`Supabase insert for model "${model.name}" did not return a row.`);
    }

    return buildLoadedRow(model, inserted);
  }

  async function updateStoredRow(
    model: ManifestModel,
    current: LoadedRow,
    next: BuiltRow,
  ): Promise<LoadedRow> {
    const idField = model.fields.id;
    if (!idField) {
      throw new Error(`Supabase updates require an id field on model "${model.name}".`);
    }

    const currentId = current.stored[idField.column] ?? current.data[idField.name];
    const query = modelTable(model)
      .update(stripUndefinedValues(next.stored))
      .eq(idField.column, currentId)
      .select("*");
    const response = await executeQuery<SupabaseRow[] | SupabaseRow>(query);
    const updated = normalizeResponseRows(response)[0];

    if (!updated) {
      throw new Error(`Supabase update for model "${model.name}" did not return a row.`);
    }

    return buildLoadedRow(model, updated);
  }

  async function deleteStoredRow(model: ManifestModel, row: LoadedRow) {
    const idField = model.fields.id;
    if (!idField) {
      throw new Error(`Supabase deletes require an id field on model "${model.name}".`);
    }

    const currentId = row.stored[idField.column] ?? row.data[idField.name];
    await executeQuery(modelTable(model).delete().eq(idField.column, currentId));
  }

  async function loadUniqueRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    where: Record<string, unknown>,
  ) {
    const manifest = getSupportedManifest(schema);
    const model = manifest.models[modelName];
    const lookup = requireUniqueLookup(model, where, "FindUnique");
    const rows = await loadRows(schema, modelName);

    return (
      rows.find((row) =>
        lookup.fields.every((field) =>
          equalValues(
            row.data[field.name],
            normalizeFilterValue(model, field.name, lookup.values[field.name]),
          ),
        ),
      ) ?? null
    );
  }

  function findUniqueConflict(
    model: ManifestModel,
    candidate: SupabaseRow,
    existingRows: LoadedRow[],
    ignoreDocIds: Set<string> = new Set(),
  ) {
    const idField = model.fields.id;

    for (const row of existingRows) {
      if (ignoreDocIds.has(row.docId)) continue;

      if (
        idField &&
        candidate[idField.name] !== undefined &&
        candidate[idField.name] !== null &&
        row.data[idField.name] !== undefined &&
        row.data[idField.name] !== null &&
        equalValues(candidate[idField.name], row.data[idField.name])
      ) {
        return [idField.name];
      }

      for (const field of Object.values(model.fields)) {
        if (!field.unique) continue;
        if (candidate[field.name] === undefined || candidate[field.name] === null) continue;
        if (row.data[field.name] === undefined || row.data[field.name] === null) continue;
        if (equalValues(candidate[field.name], row.data[field.name])) {
          return [field.name];
        }
      }

      for (const constraint of model.constraints.unique) {
        if (
          !constraint.fields.every(
            (fieldName) =>
              candidate[fieldName] !== undefined &&
              candidate[fieldName] !== null &&
              row.data[fieldName] !== undefined &&
              row.data[fieldName] !== null,
          )
        ) {
          continue;
        }

        if (
          constraint.fields.every((fieldName) =>
            equalValues(candidate[fieldName], row.data[fieldName]),
          )
        ) {
          return [...constraint.fields];
        }
      }
    }

    return null;
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: SupabaseRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const modelDefinition = schema.models[modelName];
    const output: SupabaseRow = {};

    if (!select) {
      for (const fieldName of Object.keys(modelDefinition.fields)) {
        output[fieldName] = row[fieldName];
      }

      return output as SelectedRecord<TSchema, TModelName, TSelect>;
    }

    for (const [key, value] of Object.entries(select)) {
      if (!value) continue;

      if (key in modelDefinition.fields && value === true) {
        output[key] = row[key];
        continue;
      }

      if (key in modelDefinition.relations) {
        output[key] = await resolveRelation(
          schema,
          modelName,
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
    TRelationName extends RelationName<TSchema, TModelName>,
  >(
    schema: TSchema,
    modelName: TModelName,
    relationName: TRelationName,
    row: SupabaseRow,
    value: true | FindManyArgs<TSchema, any, any>,
  ) {
    const relation = schema.models[modelName].relations[relationName];
    const relationArgs = value === true ? {} : value;

    if (relation.kind === "belongsTo") {
      const foreignValue = row[relation.foreignKey];
      const targetRows = (await loadRows(schema, relation.target as ModelName<TSchema>)).filter(
        (item) => equalValues(item.data.id, foreignValue),
      );
      const target = applyModelQuery(
        relationTargetManifest(schema, relation.target),
        targetRows,
        relationArgs,
      )[0];
      return target
        ? projectRow(
            schema,
            relation.target as ModelName<TSchema>,
            target.data,
            relationArgs.select,
          )
        : null;
    }

    if (relation.kind === "hasOne") {
      const targetRows = (await loadRows(schema, relation.target as ModelName<TSchema>)).filter(
        (item) => equalValues(item.data[relation.foreignKey], row.id),
      );
      const target = applyModelQuery(
        relationTargetManifest(schema, relation.target),
        targetRows,
        relationArgs,
      )[0];
      return target
        ? projectRow(
            schema,
            relation.target as ModelName<TSchema>,
            target.data,
            relationArgs.select,
          )
        : null;
    }

    if (relation.kind === "hasMany") {
      const targetRows = (await loadRows(schema, relation.target as ModelName<TSchema>)).filter(
        (item) => equalValues(item.data[relation.foreignKey], row.id),
      );
      const matchedRows = applyModelQuery(
        relationTargetManifest(schema, relation.target),
        targetRows,
        relationArgs,
      );
      return Promise.all(
        matchedRows.map((item) =>
          projectRow(schema, relation.target as ModelName<TSchema>, item.data, relationArgs.select),
        ),
      );
    }

    const throughRows = (await loadRows(schema, relation.through as ModelName<TSchema>)).filter(
      (item) => equalValues(item.data[relation.from], row.id),
    );
    const targetIds = throughRows.map((item) => item.data[relation.to]);
    const targetRows = (await loadRows(schema, relation.target as ModelName<TSchema>)).filter(
      (item) => targetIds.some((targetId) => equalValues(targetId, item.data.id)),
    );
    const matchedRows = applyModelQuery(
      relationTargetManifest(schema, relation.target),
      targetRows,
      relationArgs,
    );

    return Promise.all(
      matchedRows.map((item) =>
        projectRow(schema, relation.target as ModelName<TSchema>, item.data, relationArgs.select),
      ),
    );
  }

  function relationTargetManifest(schema: TSchema, modelName: string) {
    return getSupportedManifest(schema).models[modelName as ModelName<TSchema>];
  }

  let driver!: OrmDriver<TSchema, SupabaseDriverHandle<TSchema>>;

  driver = {
    handle: createDriverHandle({
      kind: "supabase",
      dialect: "postgres",
      client: {
        client: config.client,
      },
      capabilities: {
        supportsNumericIds: true,
        numericIds: "generated",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: false,
        supportsSchemaNamespaces: true,
        supportsTransactionalDDL: false,
        supportsJoin: false,
        nativeRelationLoading: "none",
        textComparison: "case-sensitive",
        textMatching: {
          equality: "case-sensitive",
          contains: "case-sensitive",
          ordering: "case-sensitive",
        },
        upsert: "emulated",
        returning: {
          create: true,
          update: true,
          delete: false,
        },
        returningMode: {
          create: "record",
          update: "record",
          delete: "none",
        },
        nativeRelations: {
          singularChains: false,
          hasMany: false,
          manyToMany: false,
          filtered: false,
          ordered: false,
          paginated: false,
        },
      },
    }),
    async findMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = applyModelQuery(model, await loadRows(schema, modelName), args);
      return Promise.all(rows.map((row) => projectRow(schema, modelName, row.data, args.select)));
    },
    async findFirst(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const row = applyModelQuery(model, await loadRows(schema, modelName), args)[0];
      if (!row) return null;
      return projectRow(schema, modelName, row.data, args.select);
    },
    async findUnique(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const row = await loadUniqueRow(schema, modelName, args.where as Record<string, unknown>);
      if (!row || !matchesModelWhere(model, row.data, args.where as SupabaseWhere)) {
        return null;
      }

      return projectRow(schema, modelName, row.data, args.select);
    },
    async count(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      return applyModelQuery(model, await loadRows(schema, modelName), args).length;
    },
    async create(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const built = buildStoredRow(model, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, built.decoded, existingRows);

      if (conflict) {
        throw supabaseConstraintError(conflict);
      }

      const inserted = await insertStoredRow(model, built);
      return projectRow(schema, modelName, inserted.data, args.select);
    },
    async createMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const created: BuiltRow[] = [];

      for (const entry of args.data) {
        const built = buildStoredRow(model, entry as Partial<Record<string, unknown>>);
        const conflict = findUniqueConflict(model, built.decoded, [
          ...existingRows,
          ...created.map((row) => ({
            docId: row.docId ?? "",
            data: row.decoded,
            stored: row.stored,
          })),
        ]);

        if (conflict) {
          throw supabaseConstraintError(conflict);
        }

        created.push(built);
      }

      const insertedRows: LoadedRow[] = [];
      for (const row of created) {
        insertedRows.push(await insertStoredRow(model, row));
      }

      return Promise.all(
        insertedRows.map((row) => projectRow(schema, modelName, row.data, args.select)),
      );
    },
    async update(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const current = applyModelQuery(model, rows, {
        where: args.where as SupabaseWhere,
        take: 1,
      })[0];
      if (!current) return null;

      const next = buildUpdatedRow(model, current, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
      if (conflict) {
        throw supabaseConstraintError(conflict);
      }

      const updated = await updateStoredRow(model, current, next);
      return projectRow(schema, modelName, updated.data, args.select);
    },
    async updateMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const matched = applyModelQuery(model, rows, {
        where: args.where as SupabaseWhere,
      });
      if (!matched.length) return 0;

      const nextRows = matched.map((row) =>
        buildUpdatedRow(model, row, args.data as Partial<Record<string, unknown>>),
      );
      const keepIds = new Set(matched.map((row) => row.docId));
      const remaining = rows.filter((row) => !keepIds.has(row.docId));
      const pending: LoadedRow[] = [];

      for (const next of nextRows) {
        const conflict = findUniqueConflict(model, next.decoded, [...remaining, ...pending]);
        if (conflict) {
          throw supabaseConstraintError(conflict);
        }

        pending.push({
          docId: next.docId ?? "",
          data: next.decoded,
          stored: next.stored,
        });
      }

      for (let index = 0; index < matched.length; index += 1) {
        await updateStoredRow(model, matched[index]!, nextRows[index]!);
      }

      return nextRows.length;
    },
    async upsert(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const lookup = requireUniqueLookup(model, args.where as Record<string, unknown>, "Upsert");
      validateUniqueLookupUpdateData(
        model,
        args.update as Partial<Record<string, unknown>>,
        lookup,
        "Upsert",
      );

      const current = await loadUniqueRow(schema, modelName, args.where as Record<string, unknown>);
      if (current && matchesModelWhere(model, current.data, args.where as SupabaseWhere)) {
        const rows = await loadRows(schema, modelName);
        const next = buildUpdatedRow(
          model,
          current,
          args.update as Partial<Record<string, unknown>>,
        );
        const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
        if (conflict) {
          throw supabaseConstraintError(conflict);
        }

        const updated = await updateStoredRow(model, current, next);
        return projectRow(schema, modelName, updated.data, args.select);
      }

      const created = buildStoredRow(
        model,
        mergeUniqueLookupCreateData(
          model,
          args.create as Partial<Record<string, unknown>>,
          lookup,
          "Upsert",
        ),
      );
      const rows = await loadRows(schema, modelName);
      const conflict = findUniqueConflict(model, created.decoded, rows);
      if (conflict) {
        throw supabaseConstraintError(conflict);
      }

      const inserted = await insertStoredRow(model, created);
      return projectRow(schema, modelName, inserted.data, args.select);
    },
    async delete(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const row = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as SupabaseWhere,
        take: 1,
      })[0];
      if (!row) return 0;

      await deleteStoredRow(model, row);
      return 1;
    },
    async deleteMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as SupabaseWhere,
      });

      for (const row of rows) {
        await deleteStoredRow(model, row);
      }

      return rows.length;
    },
    async transaction(schema, run) {
      getSupportedManifest(schema);
      return run(driver);
    },
  };

  return driver;
}

export function createSupabaseDriver<TSchema extends SchemaDefinition<any>>(
  config: SupabaseDriverConfig<TSchema>,
): OrmDriver<TSchema, SupabaseDriverHandle<TSchema>> {
  return createSupabaseDriverInternal(config);
}
