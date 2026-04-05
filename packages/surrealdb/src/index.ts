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
import { RecordId, StringRecordId, Table } from "surrealdb";

type SurrealRow = Record<string, unknown>;
type SurrealWhere = Where<Record<string, unknown>>;
type SurrealSort = Partial<Record<string, "asc" | "desc">>;

const ormKindKey = "__orm_kind";
const ormTargetKey = "__orm_target";
const ormDocIdKey = "__orm_docId";
const ormRecordKind = "record";
const ormUniqueKind = "unique";
const defaultBase = "orm";

type SurrealCreateBuilderLike<TResult = unknown> = {
  content(data: Record<string, unknown>): Promise<TResult> | TResult;
};

type SurrealUpdateBuilderLike<TResult = unknown> = {
  content(data: Record<string, unknown>): Promise<TResult> | TResult;
  merge(data: Record<string, unknown>): Promise<TResult> | TResult;
  replace(data: Record<string, unknown>): Promise<TResult> | TResult;
};

type SurrealQueryLike<TResult extends unknown[] = unknown[]> = {
  collect<T extends unknown[] = TResult>(...queries: number[]): Promise<T> | T;
};

export type SurrealDbClientLike = {
  query?<TResult extends unknown[] = unknown[]>(
    query: string,
    bindings?: Record<string, unknown>,
  ): SurrealQueryLike<TResult>;
  select?<TResult = unknown>(
    resource: Table | RecordId | StringRecordId,
  ): Promise<TResult> | TResult;
  create?<TResult = unknown>(
    resource: Table | RecordId,
  ): SurrealCreateBuilderLike<TResult> | Promise<TResult> | TResult;
  update?<TResult = unknown>(
    resource: Table | RecordId | StringRecordId,
  ): SurrealUpdateBuilderLike<TResult>;
  upsert?<TResult = unknown>(
    resource: Table | RecordId | StringRecordId,
  ): SurrealUpdateBuilderLike<TResult>;
  delete?<TResult = unknown>(
    resource: Table | RecordId | StringRecordId,
  ): Promise<TResult> | TResult;
  beginTransaction?(): Promise<SurrealDbTransactionLike> | SurrealDbTransactionLike;
  commit?(): Promise<unknown> | unknown;
  cancel?(): Promise<unknown> | unknown;
  close?(): Promise<unknown> | unknown;
  connect?(): Promise<unknown> | unknown;
  use?(what?: unknown): Promise<unknown> | unknown;
  signin?(auth: unknown): Promise<unknown> | unknown;
  authenticate?(token: unknown): Promise<unknown> | unknown;
};

export type SurrealDbTransactionLike = SurrealDbClientLike & {
  commit?(): Promise<unknown> | unknown;
  cancel?(): Promise<unknown> | unknown;
};

export type SurrealDbFieldTransform = {
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
};

export type SurrealDbModelPrefixMap<TSchema extends SchemaDefinition<any>> = Partial<
  Record<ModelName<TSchema>, string>
>;

export type SurrealDbDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: SurrealDbClientLike;
  base?: string;
  prefixes?: SurrealDbModelPrefixMap<TSchema>;
  transforms?: Partial<Record<string, Partial<Record<string, SurrealDbFieldTransform>>>>;
};

export type SurrealDbDriverClient<TSchema extends SchemaDefinition<any>> = {
  client: SurrealDbClientLike;
  base?: string;
  prefixes?: SurrealDbModelPrefixMap<TSchema>;
};

export type SurrealDbDriverHandle<TSchema extends SchemaDefinition<any>> = OrmDriverHandle<
  "surrealdb",
  SurrealDbDriverClient<TSchema>
>;

type InternalDriverConfig<TSchema extends SchemaDefinition<any>> =
  SurrealDbDriverConfig<TSchema> & {
    __insideTransaction?: boolean;
  };

type LoadedRow = {
  docId: string;
  key: string;
  data: SurrealRow;
  stored: SurrealRow;
};

type UniqueLock = {
  key: string;
  target: string;
  fields: string[];
};

type StoredRecordItem = {
  __orm_kind: "record";
  __orm_docId: string;
  data: SurrealRow;
};

type StoredUniqueItem = {
  __orm_kind: "unique";
  __orm_target: string;
};

type StoredKvItem = {
  key: string;
  value: string;
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

function joinSurrealKey(...parts: Array<string | undefined | null>) {
  return parts.filter((part) => part && part.length > 0).join(":");
}

function isStoredRecordItem(value: unknown): value is StoredRecordItem {
  return (
    isRecord(value) &&
    value[ormKindKey] === ormRecordKind &&
    typeof value[ormDocIdKey] === "string" &&
    isRecord(value.data)
  );
}

function isStoredUniqueItem(value: unknown): value is StoredUniqueItem {
  return (
    isRecord(value) &&
    value[ormKindKey] === ormUniqueKind &&
    typeof value[ormTargetKey] === "string"
  );
}

function isStoredKvItem(value: unknown): value is StoredKvItem {
  return isRecord(value) && typeof value.key === "string" && typeof value.value === "string";
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

function sortRows(rows: LoadedRow[], orderBy?: SurrealSort) {
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

function surrealdbConstraintError(target?: string | string[]) {
  const fields = Array.isArray(target) ? target.join(", ") : (target ?? "unique fields");
  const error = new Error(`SurrealDB unique constraint violation on ${fields}.`);
  Object.assign(error, {
    name: "SurrealDbUniqueConstraintError",
    code: "SURREALDB_UNIQUE_CONSTRAINT",
    target,
  });
  return error;
}

function parseStoredJson<T>(raw: unknown) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (isRecord(raw)) {
    return raw as T;
  }
  return null;
}

function escapePatternCharacter(character: string) {
  return /[\\^$+?.()|[\]{}]/.test(character) ? `\\${character}` : character;
}

function matchesSurrealPattern(key: string, pattern: string) {
  const source = Array.from(pattern)
    .map((character) => {
      if (character === "*") return ".*";
      if (character === "?") return ".";
      return escapePatternCharacter(character);
    })
    .join("");

  return new RegExp(`^${source}$`).test(key);
}

function normalizeSurrealRecordIdValue(value: unknown) {
  if (value instanceof RecordId) {
    return value.id;
  }

  if (value instanceof StringRecordId) {
    const serialized = value.toString();
    const separator = serialized.indexOf(":");
    return separator === -1 ? serialized : serialized.slice(separator + 1);
  }

  if (isRecord(value) && "id" in value) {
    return value.id;
  }

  if (typeof value === "string") {
    const separator = value.indexOf(":");
    return separator === -1 ? value : value.slice(separator + 1);
  }

  return value;
}

function normalizeSurrealRecordIdString(value: unknown) {
  if (value instanceof RecordId || value instanceof StringRecordId) {
    return value.toString();
  }

  if (isRecord(value) && hasFunction(value, "toString")) {
    return value.toString();
  }

  return value === undefined || value === null ? "" : String(value);
}

function createSurrealDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: InternalDriverConfig<TSchema>,
): OrmDriver<TSchema, SurrealDbDriverHandle<TSchema>> {
  function getSupportedManifest(schema: TSchema) {
    const manifest = getManifest(schema);

    for (const model of Object.values(manifest.models)) {
      if (model.schema) {
        throw new Error(
          `The SurrealDB runtime does not support schema-qualified tables for model "${model.name}". Use flat table names instead.`,
        );
      }

      const idField = model.fields.id;
      if (
        idField?.kind === "id" &&
        idField.idType === "integer" &&
        idField.generated === "increment"
      ) {
        throw new Error(
          `The SurrealDB runtime does not support generated integer ids for model "${model.name}". Use manual numeric ids or a string id instead.`,
        );
      }
    }

    return manifest;
  }

  function kvTableName() {
    return `${config.base ?? defaultBase}_kv`;
  }

  function kvRecordId(key: string) {
    return new RecordId(kvTableName(), encodeURIComponent(key));
  }

  function getModelBase(schema: TSchema, modelName: ModelName<TSchema>) {
    const manifest = getSupportedManifest(schema);
    return (
      config.prefixes?.[modelName] ??
      joinSurrealKey(config.base ?? defaultBase, manifest.models[modelName].table)
    );
  }

  function recordBase(schema: TSchema, modelName: ModelName<TSchema>) {
    return joinSurrealKey(getModelBase(schema, modelName), "record");
  }

  function recordKey(schema: TSchema, modelName: ModelName<TSchema>, docId: string) {
    return joinSurrealKey(recordBase(schema, modelName), encodeURIComponent(docId));
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

  function decodeValue(modelName: string, field: ManifestField, value: unknown, docId?: string) {
    const transform = fieldTransform(modelName, field.name);
    if (transform?.decode) {
      return transform.decode(value);
    }

    if (value === undefined && field.kind === "id" && docId !== undefined) {
      if (field.idType === "integer") {
        const numeric = Number(docId);
        return Number.isFinite(numeric) ? numeric : undefined;
      }
      return docId;
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
      return value instanceof Date ? value : new Date(String(value));
    }

    return value;
  }

  function buildStoredRow(model: ManifestModel, data: Partial<Record<string, unknown>>) {
    const stored: SurrealRow = {};
    const decoded: SurrealRow = {};

    for (const field of Object.values(model.fields)) {
      const value = applyDefault(data[field.name], field);
      if (value === undefined) continue;
      const encoded = encodeValue(model.name, field, value);
      if (!(field.kind === "id" && field.column === "id")) {
        stored[field.column] = encoded;
      }
      decoded[field.name] = decodeValue(model.name, field, encoded);
    }

    const idField = model.fields.id;
    if (!idField) {
      const generated = generateUuid();
      return {
        docId: generated,
        stored,
        decoded,
      };
    }

    let idValue = decoded[idField.name];

    if (idValue === undefined || idValue === null) {
      if (idField.idType === "integer") {
        throw new Error(
          `The SurrealDB runtime requires an explicit numeric id for model "${model.name}" when using manual integer ids.`,
        );
      }

      idValue = generateUuid();
      const encodedId = encodeValue(model.name, idField, idValue);
      if (idField.column !== "id") {
        stored[idField.column] = encodedId;
      }
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
  ) {
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
          `The SurrealDB runtime does not support updating the id field for model "${model.name}".`,
        );
      }

      const encoded = encodeValue(model.name, field, value);
      if (!(field.kind === "id" && field.column === "id")) {
        stored[field.column] = encoded;
      }
      decoded[field.name] = decodeValue(model.name, field, encoded);
    }

    return {
      docId: current.docId,
      stored,
      decoded,
    };
  }

  async function selectOne(resource: RecordId | StringRecordId) {
    if (!hasFunction(config.client, "select")) {
      throw new Error('The SurrealDB runtime client is missing required "select()" support.');
    }

    try {
      return await config.client.select(resource);
    } catch (error) {
      const record = isRecord(error) ? error : {};
      const name = typeof record.name === "string" ? record.name : "";
      const message = typeof record.message === "string" ? record.message : "";
      if (name === "NotFoundError" || /does not exist/i.test(message)) {
        return null;
      }

      throw error;
    }
  }

  async function selectTable(table: string) {
    if (!hasFunction(config.client, "select")) {
      throw new Error('The SurrealDB runtime client is missing required "select()" support.');
    }

    try {
      const selected = await config.client.select<unknown>(new Table(table));
      if (Array.isArray(selected)) {
        return selected.filter((entry): entry is Record<string, unknown> => isRecord(entry));
      }

      return isRecord(selected) ? [selected] : [];
    } catch (error) {
      const record = isRecord(error) ? error : {};
      const name = typeof record.name === "string" ? record.name : "";
      const message = typeof record.message === "string" ? record.message : "";
      if (name === "NotFoundError" || /does not exist/i.test(message)) {
        return [];
      }

      throw error;
    }
  }

  async function createKvItem(key: string, value: string) {
    if (!hasFunction(config.client, "create")) {
      throw new Error('The SurrealDB runtime client is missing required "create()" support.');
    }

    const builder = config.client.create(kvRecordId(key));
    if (isRecord(builder) && hasFunction(builder, "content")) {
      await builder.content({ key, value });
      return;
    }

    await builder;
  }

  async function upsertKvItem(key: string, value: string) {
    if (hasFunction(config.client, "upsert")) {
      const builder = config.client.upsert(kvRecordId(key));
      if (hasFunction(builder, "replace")) {
        await builder.replace({ key, value });
        return;
      }
      const contentBuilder = builder as unknown;
      if (isRecord(contentBuilder) && hasFunction(contentBuilder, "content")) {
        await contentBuilder.content({ key, value });
        return;
      }
    }

    if (hasFunction(config.client, "update")) {
      const builder = config.client.update(kvRecordId(key));
      if (hasFunction(builder, "replace")) {
        await builder.replace({ key, value });
        return;
      }
      const contentBuilder = builder as unknown;
      if (isRecord(contentBuilder) && hasFunction(contentBuilder, "content")) {
        await contentBuilder.content({ key, value });
        return;
      }
    }

    await createKvItem(key, value);
  }

  async function getString(key: string) {
    const item = parseStoredJson<StoredKvItem>(await selectOne(kvRecordId(key)));
    return isStoredKvItem(item) ? item.value : null;
  }

  async function setString(key: string, value: string) {
    await upsertKvItem(key, value);
  }

  async function setStringNx(key: string, value: string) {
    try {
      await createKvItem(key, value);
      return true;
    } catch (error) {
      const record = isRecord(error) ? error : {};
      const name = typeof record.name === "string" ? record.name : "";
      const message = typeof record.message === "string" ? record.message : "";
      if (name === "AlreadyExistsError" || /already exists/i.test(message)) {
        return false;
      }
      throw error;
    }
  }

  async function deleteKey(key: string) {
    if (!hasFunction(config.client, "delete")) {
      throw new Error('The SurrealDB runtime client is missing required "delete()" support.');
    }

    await config.client.delete(kvRecordId(key));
  }

  async function listKeys(pattern: string) {
    const items = await selectTable(kvTableName());
    return items
      .map((entry) => parseStoredJson<StoredKvItem>(entry))
      .filter((entry): entry is StoredKvItem => isStoredKvItem(entry))
      .map((entry) => entry.key)
      .filter((key) => matchesSurrealPattern(key, pattern));
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

  function matchesModelWhere(model: ManifestModel, record: SurrealRow, where?: SurrealWhere) {
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
      where?: SurrealWhere;
      orderBy?: SurrealSort;
      skip?: number;
      take?: number;
    } = {},
  ) {
    const filtered = rows.filter((row) => matchesModelWhere(model, row.data, args.where));
    const sorted = sortRows(filtered, args.orderBy);
    return pageRows(sorted, args.skip, args.take);
  }

  function serializeUniqueValue(model: ManifestModel, fieldName: string, value: unknown) {
    const field = model.fields[fieldName];
    const normalized = decodeValue(model.name, field, encodeValue(model.name, field, value));

    if (normalized instanceof Date) {
      return normalized.toISOString();
    }

    if (typeof normalized === "bigint") {
      return normalized.toString();
    }

    return JSON.stringify(normalized);
  }

  function uniqueLockKey(schema: TSchema, model: ManifestModel, fields: string[], row: SurrealRow) {
    const values = fields.map((fieldName) => row[fieldName]);
    if (values.some((value) => value === undefined || value === null)) {
      return null;
    }

    return joinSurrealKey(
      getModelBase(schema, model.name as ModelName<TSchema>),
      "unique",
      fields.join("+"),
      ...fields.map((fieldName) =>
        encodeURIComponent(serializeUniqueValue(model, fieldName, row[fieldName])),
      ),
    );
  }

  function uniqueLocksForRow(
    schema: TSchema,
    model: ManifestModel,
    row: SurrealRow,
    docId: string,
  ) {
    const target = recordKey(schema, model.name as ModelName<TSchema>, docId);
    const locks: UniqueLock[] = [];

    for (const field of Object.values(model.fields)) {
      if (!field.unique) continue;
      const key = uniqueLockKey(schema, model, [field.name], row);
      if (!key) continue;
      locks.push({
        key,
        target,
        fields: [field.name],
      });
    }

    for (const constraint of model.constraints.unique) {
      const key = uniqueLockKey(schema, model, [...constraint.fields], row);
      if (!key) continue;
      locks.push({
        key,
        target,
        fields: [...constraint.fields],
      });
    }

    return locks;
  }

  async function loadRowByKey(model: ManifestModel, key: string) {
    const item = parseStoredJson<StoredRecordItem>(await getString(key));
    if (!isStoredRecordItem(item)) {
      return null;
    }

    const decoded: SurrealRow = {};
    for (const field of Object.values(model.fields)) {
      decoded[field.name] = decodeValue(
        model.name,
        field,
        item.data[field.column],
        item.__orm_docId,
      );
    }

    return {
      docId: item.__orm_docId,
      key,
      data: decoded,
      stored: item.data,
    } satisfies LoadedRow;
  }

  async function loadRows<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
  ) {
    const model = getSupportedManifest(schema).models[modelName];
    const keys = await listKeys(`${recordBase(schema, modelName)}:*`);
    const rows = await Promise.all(keys.map((key) => loadRowByKey(model, key)));
    return rows.filter((row): row is LoadedRow => !!row);
  }

  async function loadUniqueRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    where: Record<string, unknown>,
  ) {
    const manifest = getSupportedManifest(schema);
    const model = manifest.models[modelName];
    const lookup = requireUniqueLookup(model, where, "FindUnique");

    if (lookup.kind === "id") {
      return loadRowByKey(
        model,
        recordKey(schema, modelName, String(lookup.values[lookup.fields[0]!.name])),
      );
    }

    const normalizedLookupRow = Object.fromEntries(
      lookup.fields.map((field) => [
        field.name,
        decodeValue(model.name, field, encodeValue(model.name, field, lookup.values[field.name])),
      ]),
    );
    const key = uniqueLockKey(
      schema,
      model,
      lookup.fields.map((field) => field.name),
      normalizedLookupRow,
    );
    if (!key) {
      return null;
    }

    const lock = parseStoredJson<StoredUniqueItem>(await getString(key));
    if (!isStoredUniqueItem(lock)) {
      return null;
    }

    return loadRowByKey(model, lock.__orm_target);
  }

  function findUniqueConflict(
    model: ManifestModel,
    candidate: SurrealRow,
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

  function serializeItem(value: StoredRecordItem | StoredUniqueItem) {
    return JSON.stringify(value);
  }

  function buildRecordItem(row: { docId: string; stored: SurrealRow }): StoredRecordItem {
    return {
      __orm_kind: ormRecordKind,
      __orm_docId: row.docId,
      data: row.stored,
    };
  }

  async function putRecordSequential(
    schema: TSchema,
    modelName: ModelName<TSchema>,
    row: { docId: string; stored: SurrealRow },
    conditionallyCreate: boolean,
  ) {
    const key = recordKey(schema, modelName, row.docId);
    const payload = serializeItem(buildRecordItem(row));

    if (conditionallyCreate) {
      if (!(await setStringNx(key, payload))) {
        throw surrealdbConstraintError(["id"]);
      }
      return;
    }

    await setString(key, payload);
  }

  async function putUniqueSequential(lock: UniqueLock) {
    const existing = parseStoredJson<StoredUniqueItem>(await getString(lock.key));
    if (isStoredUniqueItem(existing)) {
      if (existing.__orm_target !== lock.target) {
        throw surrealdbConstraintError(lock.fields);
      }
      return;
    }

    const written = await setStringNx(
      lock.key,
      serializeItem({
        __orm_kind: ormUniqueKind,
        __orm_target: lock.target,
      } satisfies StoredUniqueItem),
    );

    if (written) {
      return;
    }

    const current = parseStoredJson<StoredUniqueItem>(await getString(lock.key));
    if (isStoredUniqueItem(current) && current.__orm_target === lock.target) {
      return;
    }

    throw surrealdbConstraintError(lock.fields);
  }

  async function deleteSequential(key: string) {
    await deleteKey(key);
  }

  async function acquireUniqueLocksSequential(locks: UniqueLock[]) {
    const acquired: UniqueLock[] = [];

    try {
      for (const lock of locks) {
        await putUniqueSequential(lock);
        acquired.push(lock);
      }
    } catch (error) {
      await releaseUniqueLocksSequential(acquired);
      throw error;
    }

    return acquired;
  }

  async function releaseUniqueLocksSequential(locks: UniqueLock[]) {
    for (const lock of [...locks].reverse()) {
      try {
        await deleteSequential(lock.key);
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  async function createRecordWithLocks(
    schema: TSchema,
    modelName: ModelName<TSchema>,
    row: { docId: string; stored: SurrealRow; decoded: SurrealRow },
    model: ManifestModel,
  ) {
    const locks = uniqueLocksForRow(schema, model, row.decoded, row.docId);
    const acquired = await acquireUniqueLocksSequential(locks);

    try {
      await putRecordSequential(schema, modelName, row, true);
    } catch (error) {
      await releaseUniqueLocksSequential(acquired);
      throw error;
    }
  }

  async function updateRecordWithLocks(
    schema: TSchema,
    modelName: ModelName<TSchema>,
    model: ManifestModel,
    current: LoadedRow,
    next: { docId: string; stored: SurrealRow; decoded: SurrealRow },
  ) {
    const currentLocks = new Map(
      uniqueLocksForRow(schema, model, current.data, current.docId).map((lock) => [lock.key, lock]),
    );
    const nextLocks = new Map(
      uniqueLocksForRow(schema, model, next.decoded, next.docId).map((lock) => [lock.key, lock]),
    );
    const addedLocks = [...nextLocks.values()].filter((lock) => !currentLocks.has(lock.key));
    const removedLocks = [...currentLocks.values()].filter((lock) => !nextLocks.has(lock.key));
    const acquired = await acquireUniqueLocksSequential(addedLocks);

    try {
      await putRecordSequential(schema, modelName, next, false);
    } catch (error) {
      await releaseUniqueLocksSequential(acquired);
      throw error;
    }

    for (const lock of removedLocks) {
      await deleteSequential(lock.key);
    }
  }

  async function deleteRecordWithLocks(
    schema: TSchema,
    modelName: ModelName<TSchema>,
    model: ManifestModel,
    current: LoadedRow,
  ) {
    await deleteSequential(recordKey(schema, modelName, current.docId));
    const locks = uniqueLocksForRow(schema, model, current.data, current.docId);
    for (const lock of locks) {
      await deleteSequential(lock.key);
    }
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: SurrealRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const modelDefinition = schema.models[modelName];
    const output: SurrealRow = {};

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
    row: SurrealRow,
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

  async function withTransactionalDriver<TResult>(
    run: (txDriver: OrmDriver<TSchema, SurrealDbDriverHandle<TSchema>>) => Promise<TResult>,
  ) {
    if (config.__insideTransaction || !hasFunction(config.client, "beginTransaction")) {
      return run(driver);
    }

    const transaction = await config.client.beginTransaction();
    const txDriver = createSurrealDriverInternal({
      ...config,
      client: transaction,
      __insideTransaction: true,
    });

    try {
      const result = await run(txDriver);
      if (hasFunction(transaction, "commit")) {
        await transaction.commit();
      }
      return result;
    } catch (error) {
      if (hasFunction(transaction, "cancel")) {
        await transaction.cancel();
      }
      throw error;
    }
  }

  let driver!: OrmDriver<TSchema, SurrealDbDriverHandle<TSchema>>;

  driver = {
    handle: createDriverHandle({
      kind: "surrealdb",
      client: {
        client: config.client,
        base: config.base,
        prefixes: config.prefixes,
      },
      capabilities: {
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: true,
        supportsSchemaNamespaces: false,
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
      if (!row || !matchesModelWhere(model, row.data, args.where as SurrealWhere)) {
        return null;
      }

      return projectRow(schema, modelName, row.data, args.select);
    },
    async count(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      return applyModelQuery(model, await loadRows(schema, modelName), args).length;
    },
    async create(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.create(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const built = buildStoredRow(model, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, built.decoded, existingRows);

      if (conflict) {
        throw surrealdbConstraintError(conflict);
      }

      await createRecordWithLocks(schema, modelName, built, model);
      return projectRow(schema, modelName, built.decoded, args.select);
    },
    async createMany(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.createMany(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const created: Array<{ docId: string; stored: SurrealRow; decoded: SurrealRow }> = [];

      for (const entry of args.data) {
        const built = buildStoredRow(model, entry as Partial<Record<string, unknown>>);
        const conflict = findUniqueConflict(model, built.decoded, [
          ...existingRows,
          ...created.map((row) => ({
            docId: row.docId,
            key: recordKey(schema, modelName, row.docId),
            data: row.decoded,
            stored: row.stored,
          })),
        ]);

        if (conflict) {
          throw surrealdbConstraintError(conflict);
        }

        created.push(built);
      }

      for (const row of created) {
        await createRecordWithLocks(schema, modelName, row, model);
      }

      return Promise.all(
        created.map((row) => projectRow(schema, modelName, row.decoded, args.select)),
      );
    },
    async update(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.update(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const current = applyModelQuery(model, rows, {
        where: args.where as SurrealWhere,
        take: 1,
      })[0];
      if (!current) return null;

      const next = buildUpdatedRow(model, current, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
      if (conflict) {
        throw surrealdbConstraintError(conflict);
      }

      await updateRecordWithLocks(schema, modelName, model, current, next);
      return projectRow(schema, modelName, next.decoded, args.select);
    },
    async updateMany(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.updateMany(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const matched = applyModelQuery(model, rows, {
        where: args.where as SurrealWhere,
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
          throw surrealdbConstraintError(conflict);
        }

        pending.push({
          docId: next.docId,
          key: recordKey(schema, modelName, next.docId),
          data: next.decoded,
          stored: next.stored,
        });
      }

      for (let index = 0; index < matched.length; index += 1) {
        await updateRecordWithLocks(schema, modelName, model, matched[index]!, nextRows[index]!);
      }

      return nextRows.length;
    },
    async upsert(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.upsert(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const lookup = requireUniqueLookup(model, args.where as Record<string, unknown>, "Upsert");
      validateUniqueLookupUpdateData(
        model,
        args.update as Partial<Record<string, unknown>>,
        lookup,
        "Upsert",
      );

      const current = await loadUniqueRow(schema, modelName, args.where as Record<string, unknown>);
      if (current && matchesModelWhere(model, current.data, args.where as SurrealWhere)) {
        const rows = await loadRows(schema, modelName);
        const next = buildUpdatedRow(
          model,
          current,
          args.update as Partial<Record<string, unknown>>,
        );
        const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
        if (conflict) {
          throw surrealdbConstraintError(conflict);
        }

        await updateRecordWithLocks(schema, modelName, model, current, next);
        return projectRow(schema, modelName, next.decoded, args.select);
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
        throw surrealdbConstraintError(conflict);
      }

      await createRecordWithLocks(schema, modelName, created, model);
      return projectRow(schema, modelName, created.decoded, args.select);
    },
    async delete(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.delete(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const row = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as SurrealWhere,
        take: 1,
      })[0];
      if (!row) return 0;

      await deleteRecordWithLocks(schema, modelName, model, row);
      return 1;
    },
    async deleteMany(schema, modelName, args) {
      if (!config.__insideTransaction) {
        return withTransactionalDriver((txDriver) => txDriver.deleteMany(schema, modelName, args));
      }

      const model = getSupportedManifest(schema).models[modelName];
      const rows = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as SurrealWhere,
      });

      for (const row of rows) {
        await deleteRecordWithLocks(schema, modelName, model, row);
      }

      return rows.length;
    },
    async transaction(schema, run) {
      getSupportedManifest(schema);

      if (config.__insideTransaction || !hasFunction(config.client, "beginTransaction")) {
        return run(driver);
      }

      const transaction = await config.client.beginTransaction();
      const txDriver = createSurrealDriverInternal({
        ...config,
        client: transaction,
        __insideTransaction: true,
      });

      try {
        const result = await run(txDriver);
        if (hasFunction(transaction, "commit")) {
          await transaction.commit();
        }
        return result;
      } catch (error) {
        if (hasFunction(transaction, "cancel")) {
          await transaction.cancel();
        }
        throw error;
      }
    },
  };

  return driver;
}

export function createSurrealDbDriver<TSchema extends SchemaDefinition<any>>(
  config: SurrealDbDriverConfig<TSchema>,
): OrmDriver<TSchema, SurrealDbDriverHandle<TSchema>> {
  return createSurrealDriverInternal(config);
}
