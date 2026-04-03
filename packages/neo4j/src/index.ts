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
  type OrmDriverCapabilityInput,
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

type Neo4jRow = Record<string, unknown>;
type Neo4jWhere = Where<Record<string, unknown>>;
type Neo4jSort = Partial<Record<string, "asc" | "desc">>;

const recordLabel = "FarmOrmRecord";
const uniqueLabel = "FarmOrmUnique";
const namespaceProp = "__ormNamespace";
const modelProp = "__ormModel";
const docIdProp = "__ormDocId";
const keyProp = "__ormKey";
const targetProp = "__ormTargetDocId";
const defaultBase = "orm";

export type Neo4jResultRecordLike = {
  get?(key: string): unknown;
  toObject?(): Record<string, unknown>;
  [key: string]: unknown;
};

export type Neo4jResultLike = {
  records?: readonly Neo4jResultRecordLike[];
};

export type Neo4jTransactionLike = {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jResultLike> | Neo4jResultLike;
  commit?(): Promise<unknown> | unknown;
  rollback?(): Promise<unknown> | unknown;
  close?(): Promise<unknown> | unknown;
};

export type Neo4jSessionLike = {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jResultLike> | Neo4jResultLike;
  beginTransaction?(): Promise<Neo4jTransactionLike> | Neo4jTransactionLike;
  close?(): Promise<unknown> | unknown;
  executeRead?<TResult>(
    run: (tx: Neo4jTransactionLike) => Promise<TResult>,
  ): Promise<TResult> | TResult;
  executeWrite?<TResult>(
    run: (tx: Neo4jTransactionLike) => Promise<TResult>,
  ): Promise<TResult> | TResult;
};

export type Neo4jDriverLike = {
  session(config?: { database?: string }): Neo4jSessionLike;
  close?(): Promise<unknown> | unknown;
  verifyConnectivity?(): Promise<unknown> | unknown;
  getServerInfo?(): Promise<unknown> | unknown;
};

export type Neo4jClientLike = Neo4jDriverLike | Neo4jSessionLike | Neo4jTransactionLike;

export type Neo4jFieldTransform = {
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
};

export type Neo4jDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: Neo4jClientLike;
  base?: string;
  database?: string;
  transforms?: Partial<Record<string, Partial<Record<string, Neo4jFieldTransform>>>>;
  capabilities?: OrmDriverCapabilityInput;
  handle?: Neo4jDriverHandle<Neo4jDriverClient<TSchema>>;
};

export type Neo4jDriverClient<TSchema extends SchemaDefinition<any>> = {
  client: Neo4jClientLike;
  base?: string;
  database?: string;
};

export type Neo4jDriverHandle<TClient = Neo4jDriverClient<any>> = OrmDriverHandle<"neo4j", TClient>;

type LoadedRow = {
  docId: string;
  data: Neo4jRow;
  stored: Neo4jRow;
};

type UniqueLock = {
  key: string;
  targetDocId: string;
  fields: string[];
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

function isNeo4jDriver(value: unknown): value is Neo4jDriverLike {
  return hasFunction(value, "session");
}

function isNeo4jSession(value: unknown): value is Neo4jSessionLike {
  return (
    hasFunction(value, "run") &&
    (hasFunction(value, "beginTransaction") || hasFunction(value, "close"))
  );
}

function isNeo4jTransaction(value: unknown): value is Neo4jTransactionLike {
  return (
    hasFunction(value, "run") && (hasFunction(value, "commit") || hasFunction(value, "rollback"))
  );
}

function joinNamespace(...parts: Array<string | undefined | null>) {
  return parts.filter((part) => part && part.length > 0).join(":");
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

function sortRows(rows: LoadedRow[], orderBy?: Neo4jSort) {
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

function neo4jConstraintError(target?: string | string[]) {
  const fields = Array.isArray(target) ? target.join(", ") : (target ?? "unique fields");
  const error = new Error(`Neo4j unique constraint violation on ${fields}.`);
  Object.assign(error, {
    name: "Neo4jUniqueConstraintError",
    code: "NEO4J_UNIQUE_CONSTRAINT",
    target,
  });
  return error;
}

function normalizeNeo4jValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNeo4jValue(entry));
  }

  if (
    isRecord(value) &&
    hasFunction(value, "toBigInt") &&
    (hasFunction(value, "inSafeRange") || hasFunction(value, "toNumber"))
  ) {
    const safe = hasFunction(value, "inSafeRange") ? Boolean(value.inSafeRange()) : true;
    if (safe && hasFunction(value, "toNumber")) {
      return value.toNumber();
    }
    return value.toString();
  }

  if (isRecord(value) && !hasFunction(value, "get") && !hasFunction(value, "toObject")) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeNeo4jValue(entry)]),
    );
  }

  return value;
}

function getRecordField(record: Neo4jResultRecordLike, key: string) {
  if (hasFunction(record, "get")) {
    return normalizeNeo4jValue(record.get(key));
  }

  if (hasFunction(record, "toObject")) {
    return normalizeNeo4jValue(record.toObject()[key]);
  }

  return normalizeNeo4jValue(record[key]);
}

async function closeResource(value: unknown) {
  if (hasFunction(value, "close")) {
    await value.close();
  }
}

function openSession(client: Neo4jDriverLike, database?: string) {
  return client.session(database ? { database } : undefined);
}

async function runCypher(
  client: Neo4jClientLike,
  query: string,
  params: Record<string, unknown>,
  database?: string,
) {
  if (isNeo4jDriver(client)) {
    const session = openSession(client, database);
    try {
      return await session.run(query, params);
    } finally {
      await closeResource(session);
    }
  }

  return client.run(query, params);
}

async function withWriteScope<TResult>(
  client: Neo4jClientLike,
  database: string | undefined,
  run: (client: Neo4jClientLike) => Promise<TResult>,
) {
  if (isNeo4jTransaction(client)) {
    return run(client);
  }

  if (isNeo4jSession(client) && hasFunction(client, "executeWrite")) {
    return client.executeWrite(async (tx) => run(tx));
  }

  if (isNeo4jSession(client) && hasFunction(client, "beginTransaction")) {
    const tx = await client.beginTransaction();
    try {
      const result = await run(tx);
      if (hasFunction(tx, "commit")) {
        await tx.commit();
      }
      return result;
    } catch (error) {
      if (hasFunction(tx, "rollback")) {
        await tx.rollback();
      }
      throw error;
    } finally {
      await closeResource(tx);
    }
  }

  if (isNeo4jDriver(client)) {
    const session = openSession(client, database);
    try {
      if (hasFunction(session, "executeWrite")) {
        return session.executeWrite(async (tx) => run(tx));
      }

      if (hasFunction(session, "beginTransaction")) {
        const tx = await session.beginTransaction();
        try {
          const result = await run(tx);
          if (hasFunction(tx, "commit")) {
            await tx.commit();
          }
          return result;
        } catch (error) {
          if (hasFunction(tx, "rollback")) {
            await tx.rollback();
          }
          throw error;
        } finally {
          await closeResource(tx);
        }
      }

      return run(session);
    } finally {
      await closeResource(session);
    }
  }

  return run(client);
}

function createNeo4jDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: Neo4jDriverConfig<TSchema>,
): OrmDriver<TSchema, Neo4jDriverHandle<Neo4jDriverClient<TSchema>>> {
  function getSupportedManifest(schema: TSchema) {
    const manifest = getManifest(schema);

    for (const model of Object.values(manifest.models)) {
      if (model.schema) {
        throw new Error(
          `The Neo4j runtime does not support schema-qualified tables for model "${model.name}". Use flat table names instead.`,
        );
      }

      const idField = model.fields.id;
      if (
        idField?.kind === "id" &&
        idField.idType === "integer" &&
        idField.generated === "increment"
      ) {
        throw new Error(
          `The Neo4j runtime does not support generated integer ids for model "${model.name}". Use manual numeric ids or a string id instead.`,
        );
      }
    }

    return manifest;
  }

  function namespace() {
    return config.base ?? defaultBase;
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

    if (field.kind === "json") {
      return JSON.stringify(value);
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
      return value instanceof Date ? value : new Date(value as string | number);
    }

    if (field.kind === "json") {
      if (typeof value === "string") {
        return JSON.parse(value);
      }
      return value;
    }

    return value;
  }

  function buildStoredRow(model: ManifestModel, data: Partial<Record<string, unknown>>) {
    const stored: Neo4jRow = {};
    const decoded: Neo4jRow = {};

    for (const field of Object.values(model.fields)) {
      const value = applyDefault(data[field.name], field);
      if (value === undefined) continue;
      const encoded = encodeValue(model.name, field, value);
      stored[field.column] = encoded;
      decoded[field.name] = decodeValue(model.name, field, encoded);
    }

    const idField = model.fields.id;
    if (!idField) {
      return {
        docId: generateUuid(),
        stored,
        decoded,
      };
    }

    let idValue = decoded[idField.name];

    if (idValue === undefined || idValue === null) {
      if (idField.idType === "integer") {
        throw new Error(
          `The Neo4j runtime requires an explicit numeric id for model "${model.name}" when using manual integer ids.`,
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
          `The Neo4j runtime does not support updating the id field for model "${model.name}".`,
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

  function toNodeProperties(model: ManifestModel, row: { docId: string; stored: Neo4jRow }) {
    return {
      [namespaceProp]: namespace(),
      [modelProp]: model.name,
      [docIdProp]: row.docId,
      ...row.stored,
    };
  }

  function loadedRowFromProps(model: ManifestModel, props: Neo4jRow | null) {
    if (!props || typeof props[docIdProp] !== "string") {
      return null;
    }

    const stored: Neo4jRow = {};
    const decoded: Neo4jRow = {};

    for (const field of Object.values(model.fields)) {
      const encoded = props[field.column];
      if (encoded !== undefined) {
        stored[field.column] = encoded;
      }
      decoded[field.name] = decodeValue(model.name, field, encoded, String(props[docIdProp]));
    }

    return {
      docId: String(props[docIdProp]),
      data: decoded,
      stored,
    } satisfies LoadedRow;
  }

  async function queryRows(
    client: Neo4jClientLike,
    query: string,
    params: Record<string, unknown>,
  ) {
    const result = await runCypher(client, query, params, config.database);
    const records = Array.isArray(result.records) ? result.records : [];
    return records.map((record) => {
      if (hasFunction(record, "toObject")) {
        return normalizeNeo4jValue(record.toObject()) as Record<string, unknown>;
      }

      const fallback: Record<string, unknown> = {};
      for (const key of ["props", "targetDocId", "count"]) {
        const value = getRecordField(record, key);
        if (value !== undefined) {
          fallback[key] = value;
        }
      }
      return fallback;
    });
  }

  async function loadRowByDocId(client: Neo4jClientLike, model: ManifestModel, docId: string) {
    const rows = await queryRows(
      client,
      `/* farm_orm:loadRecordByDocId */
MATCH (n:${recordLabel})
WHERE n.${namespaceProp} = $namespace
  AND n.${modelProp} = $model
  AND n.${docIdProp} = $docId
RETURN properties(n) AS props`,
      {
        namespace: namespace(),
        model: model.name,
        docId,
      },
    );

    return loadedRowFromProps(model, (rows[0]?.props as Neo4jRow | undefined) ?? null);
  }

  async function loadRows<TModelName extends ModelName<TSchema>>(
    client: Neo4jClientLike,
    schema: TSchema,
    modelName: TModelName,
  ) {
    const model = getSupportedManifest(schema).models[modelName];
    const rows = await queryRows(
      client,
      `/* farm_orm:loadRecords */
MATCH (n:${recordLabel})
WHERE n.${namespaceProp} = $namespace
  AND n.${modelProp} = $model
RETURN properties(n) AS props`,
      {
        namespace: namespace(),
        model: model.name,
      },
    );

    return rows
      .map((row) => loadedRowFromProps(model, (row.props as Neo4jRow | undefined) ?? null))
      .filter((row): row is LoadedRow => !!row);
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

  function matchesModelWhere(model: ManifestModel, record: Neo4jRow, where?: Neo4jWhere) {
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
      where?: Neo4jWhere;
      orderBy?: Neo4jSort;
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

  function uniqueLockKey(model: ManifestModel, fields: string[], row: Neo4jRow) {
    const values = fields.map((fieldName) => row[fieldName]);
    if (values.some((value) => value === undefined || value === null)) {
      return null;
    }

    return joinNamespace(
      namespace(),
      model.name,
      "unique",
      fields.join("+"),
      ...fields.map((fieldName) => serializeUniqueValue(model, fieldName, row[fieldName])),
    );
  }

  function uniqueLocksForRow(model: ManifestModel, row: Neo4jRow, docId: string) {
    const locks: UniqueLock[] = [];

    for (const field of Object.values(model.fields)) {
      if (!field.unique) continue;
      const key = uniqueLockKey(model, [field.name], row);
      if (!key) continue;
      locks.push({
        key,
        targetDocId: docId,
        fields: [field.name],
      });
    }

    for (const constraint of model.constraints.unique) {
      const key = uniqueLockKey(model, [...constraint.fields], row);
      if (!key) continue;
      locks.push({
        key,
        targetDocId: docId,
        fields: [...constraint.fields],
      });
    }

    return locks;
  }

  async function loadUniqueRow<TModelName extends ModelName<TSchema>>(
    client: Neo4jClientLike,
    schema: TSchema,
    modelName: TModelName,
    where: Record<string, unknown>,
  ) {
    const manifest = getSupportedManifest(schema);
    const model = manifest.models[modelName];
    const lookup = requireUniqueLookup(model, where, "FindUnique");

    if (lookup.kind === "id") {
      return loadRowByDocId(client, model, String(lookup.values[lookup.fields[0]!.name]));
    }

    const normalizedLookupRow = Object.fromEntries(
      lookup.fields.map((field) => [
        field.name,
        decodeValue(model.name, field, encodeValue(model.name, field, lookup.values[field.name])),
      ]),
    );
    const key = uniqueLockKey(
      model,
      lookup.fields.map((field) => field.name),
      normalizedLookupRow,
    );
    if (!key) {
      return null;
    }

    const rows = await queryRows(
      client,
      `/* farm_orm:getUnique */
MATCH (u:${uniqueLabel})
WHERE u.${namespaceProp} = $namespace
  AND u.${keyProp} = $key
RETURN u.${targetProp} AS targetDocId`,
      {
        namespace: namespace(),
        key,
      },
    );

    const targetDocId = rows[0]?.targetDocId;
    if (typeof targetDocId !== "string") {
      return null;
    }

    return loadRowByDocId(client, model, targetDocId);
  }

  function findUniqueConflict(
    model: ManifestModel,
    candidate: Neo4jRow,
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

  async function putRecord(
    client: Neo4jClientLike,
    model: ManifestModel,
    row: { docId: string; stored: Neo4jRow },
    conditionallyCreate: boolean,
  ) {
    if (conditionallyCreate) {
      const existing = await loadRowByDocId(client, model, row.docId);
      if (existing) {
        throw neo4jConstraintError(["id"]);
      }
    }

    await runCypher(
      client,
      conditionallyCreate
        ? `/* farm_orm:createRecord */
CREATE (n:${recordLabel})
SET n = $props
RETURN properties(n) AS props`
        : `/* farm_orm:updateRecord */
MATCH (n:${recordLabel})
WHERE n.${namespaceProp} = $namespace
  AND n.${modelProp} = $model
  AND n.${docIdProp} = $docId
SET n = $props
RETURN properties(n) AS props`,
      conditionallyCreate
        ? {
            props: toNodeProperties(model, row),
          }
        : {
            namespace: namespace(),
            model: model.name,
            docId: row.docId,
            props: toNodeProperties(model, row),
          },
      config.database,
    );
  }

  async function putUnique(client: Neo4jClientLike, lock: UniqueLock) {
    const rows = await queryRows(
      client,
      `/* farm_orm:putUnique */
MERGE (u:${uniqueLabel} {${namespaceProp}: $namespace, ${keyProp}: $key})
ON CREATE SET u.${targetProp} = $targetDocId
RETURN u.${targetProp} AS targetDocId`,
      {
        namespace: namespace(),
        key: lock.key,
        targetDocId: lock.targetDocId,
      },
    );

    if (rows[0]?.targetDocId !== lock.targetDocId) {
      throw neo4jConstraintError(lock.fields);
    }
  }

  async function deleteUnique(client: Neo4jClientLike, key: string) {
    await runCypher(
      client,
      `/* farm_orm:deleteUnique */
MATCH (u:${uniqueLabel})
WHERE u.${namespaceProp} = $namespace
  AND u.${keyProp} = $key
DELETE u`,
      {
        namespace: namespace(),
        key,
      },
      config.database,
    );
  }

  async function deleteRecord(client: Neo4jClientLike, model: ManifestModel, docId: string) {
    await runCypher(
      client,
      `/* farm_orm:deleteRecord */
MATCH (n:${recordLabel})
WHERE n.${namespaceProp} = $namespace
  AND n.${modelProp} = $model
  AND n.${docIdProp} = $docId
DETACH DELETE n`,
      {
        namespace: namespace(),
        model: model.name,
        docId,
      },
      config.database,
    );
  }

  async function acquireUniqueLocks(client: Neo4jClientLike, locks: UniqueLock[]) {
    const acquired: UniqueLock[] = [];

    try {
      for (const lock of locks) {
        await putUnique(client, lock);
        acquired.push(lock);
      }
    } catch (error) {
      await releaseUniqueLocks(client, acquired);
      throw error;
    }

    return acquired;
  }

  async function releaseUniqueLocks(client: Neo4jClientLike, locks: UniqueLock[]) {
    for (const lock of [...locks].reverse()) {
      try {
        await deleteUnique(client, lock.key);
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  async function createRecordWithLocks(
    client: Neo4jClientLike,
    modelName: ModelName<TSchema>,
    row: { docId: string; stored: Neo4jRow; decoded: Neo4jRow },
    model: ManifestModel,
  ) {
    const locks = uniqueLocksForRow(model, row.decoded, row.docId);
    const acquired = await acquireUniqueLocks(client, locks);

    try {
      await putRecord(client, model, row, true);
    } catch (error) {
      await releaseUniqueLocks(client, acquired);
      throw error;
    }
  }

  async function updateRecordWithLocks(
    client: Neo4jClientLike,
    model: ManifestModel,
    current: LoadedRow,
    next: { docId: string; stored: Neo4jRow; decoded: Neo4jRow },
  ) {
    const currentLocks = new Map(
      uniqueLocksForRow(model, current.data, current.docId).map((lock) => [lock.key, lock]),
    );
    const nextLocks = new Map(
      uniqueLocksForRow(model, next.decoded, next.docId).map((lock) => [lock.key, lock]),
    );
    const addedLocks = [...nextLocks.values()].filter((lock) => !currentLocks.has(lock.key));
    const removedLocks = [...currentLocks.values()].filter((lock) => !nextLocks.has(lock.key));
    const acquired = await acquireUniqueLocks(client, addedLocks);

    try {
      await putRecord(client, model, next, false);
    } catch (error) {
      await releaseUniqueLocks(client, acquired);
      throw error;
    }

    for (const lock of removedLocks) {
      await deleteUnique(client, lock.key);
    }
  }

  async function deleteRecordWithLocks(
    client: Neo4jClientLike,
    model: ManifestModel,
    current: LoadedRow,
  ) {
    await deleteRecord(client, model, current.docId);
    const locks = uniqueLocksForRow(model, current.data, current.docId);
    for (const lock of locks) {
      await deleteUnique(client, lock.key);
    }
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    client: Neo4jClientLike,
    modelName: TModelName,
    row: Neo4jRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const modelDefinition = schema.models[modelName];
    const output: Neo4jRow = {};

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
          client,
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
    client: Neo4jClientLike,
    modelName: TModelName,
    relationName: TRelationName,
    row: Neo4jRow,
    value: true | FindManyArgs<TSchema, any, any>,
  ) {
    const relation = schema.models[modelName].relations[relationName];
    const relationArgs = value === true ? {} : value;

    if (relation.kind === "belongsTo") {
      const foreignValue = row[relation.foreignKey];
      const targetRows = (
        await loadRows(client, schema, relation.target as ModelName<TSchema>)
      ).filter((item) => equalValues(item.data.id, foreignValue));
      const target = applyModelQuery(
        relationTargetManifest(schema, relation.target),
        targetRows,
        relationArgs,
      )[0];
      return target
        ? projectRow(
            schema,
            client,
            relation.target as ModelName<TSchema>,
            target.data,
            relationArgs.select,
          )
        : null;
    }

    if (relation.kind === "hasOne") {
      const targetRows = (
        await loadRows(client, schema, relation.target as ModelName<TSchema>)
      ).filter((item) => equalValues(item.data[relation.foreignKey], row.id));
      const target = applyModelQuery(
        relationTargetManifest(schema, relation.target),
        targetRows,
        relationArgs,
      )[0];
      return target
        ? projectRow(
            schema,
            client,
            relation.target as ModelName<TSchema>,
            target.data,
            relationArgs.select,
          )
        : null;
    }

    if (relation.kind === "hasMany") {
      const targetRows = (
        await loadRows(client, schema, relation.target as ModelName<TSchema>)
      ).filter((item) => equalValues(item.data[relation.foreignKey], row.id));
      const matchedRows = applyModelQuery(
        relationTargetManifest(schema, relation.target),
        targetRows,
        relationArgs,
      );
      return Promise.all(
        matchedRows.map((item) =>
          projectRow(
            schema,
            client,
            relation.target as ModelName<TSchema>,
            item.data,
            relationArgs.select,
          ),
        ),
      );
    }

    const throughRows = (
      await loadRows(client, schema, relation.through as ModelName<TSchema>)
    ).filter((item) => equalValues(item.data[relation.from], row.id));
    const targetIds = throughRows.map((item) => item.data[relation.to]);
    const targetRows = (
      await loadRows(client, schema, relation.target as ModelName<TSchema>)
    ).filter((item) => targetIds.some((targetId) => equalValues(targetId, item.data.id)));
    const matchedRows = applyModelQuery(
      relationTargetManifest(schema, relation.target),
      targetRows,
      relationArgs,
    );

    return Promise.all(
      matchedRows.map((item) =>
        projectRow(
          schema,
          client,
          relation.target as ModelName<TSchema>,
          item.data,
          relationArgs.select,
        ),
      ),
    );
  }

  function relationTargetManifest(schema: TSchema, modelName: string) {
    return getSupportedManifest(schema).models[modelName as ModelName<TSchema>];
  }

  const handle =
    config.handle ??
    createDriverHandle({
      kind: "neo4j",
      client: {
        client: config.client,
        base: config.base,
        database: config.database,
      },
      capabilities: {
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: true,
        supportsSchemaNamespaces: false,
        supportsTransactionalDDL: true,
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
        ...config.capabilities,
      },
    });

  let driver!: OrmDriver<TSchema, Neo4jDriverHandle<Neo4jDriverClient<TSchema>>>;

  driver = {
    handle,
    async findMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = applyModelQuery(model, await loadRows(config.client, schema, modelName), args);
      return Promise.all(
        rows.map((row) => projectRow(schema, config.client, modelName, row.data, args.select)),
      );
    },
    async findFirst(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const row = applyModelQuery(model, await loadRows(config.client, schema, modelName), args)[0];
      if (!row) return null;
      return projectRow(schema, config.client, modelName, row.data, args.select);
    },
    async findUnique(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const row = await loadUniqueRow(
        config.client,
        schema,
        modelName,
        args.where as Record<string, unknown>,
      );
      if (!row || !matchesModelWhere(model, row.data, args.where as Neo4jWhere)) {
        return null;
      }

      return projectRow(schema, config.client, modelName, row.data, args.select);
    },
    async count(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      return applyModelQuery(model, await loadRows(config.client, schema, modelName), args).length;
    },
    async create(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const existingRows = await loadRows(activeClient, schema, modelName);
        const built = buildStoredRow(model, args.data as Partial<Record<string, unknown>>);
        const conflict = findUniqueConflict(model, built.decoded, existingRows);

        if (conflict) {
          throw neo4jConstraintError(conflict);
        }

        await createRecordWithLocks(activeClient, modelName, built, model);
        return projectRow(schema, activeClient, modelName, built.decoded, args.select);
      });
    },
    async createMany(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const existingRows = await loadRows(activeClient, schema, modelName);
        const created: Array<{ docId: string; stored: Neo4jRow; decoded: Neo4jRow }> = [];

        for (const entry of args.data) {
          const built = buildStoredRow(model, entry as Partial<Record<string, unknown>>);
          const conflict = findUniqueConflict(model, built.decoded, [
            ...existingRows,
            ...created.map((row) => ({
              docId: row.docId,
              data: row.decoded,
              stored: row.stored,
            })),
          ]);

          if (conflict) {
            throw neo4jConstraintError(conflict);
          }

          created.push(built);
        }

        for (const row of created) {
          await createRecordWithLocks(activeClient, modelName, row, model);
        }

        return Promise.all(
          created.map((row) =>
            projectRow(schema, activeClient, modelName, row.decoded, args.select),
          ),
        );
      });
    },
    async update(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const rows = await loadRows(activeClient, schema, modelName);
        const current = applyModelQuery(model, rows, {
          where: args.where as Neo4jWhere,
          take: 1,
        })[0];
        if (!current) return null;

        const next = buildUpdatedRow(model, current, args.data as Partial<Record<string, unknown>>);
        const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
        if (conflict) {
          throw neo4jConstraintError(conflict);
        }

        await updateRecordWithLocks(activeClient, model, current, next);
        return projectRow(schema, activeClient, modelName, next.decoded, args.select);
      });
    },
    async updateMany(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const rows = await loadRows(activeClient, schema, modelName);
        const matched = applyModelQuery(model, rows, {
          where: args.where as Neo4jWhere,
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
            throw neo4jConstraintError(conflict);
          }

          pending.push({
            docId: next.docId,
            data: next.decoded,
            stored: next.stored,
          });
        }

        for (let index = 0; index < matched.length; index += 1) {
          await updateRecordWithLocks(activeClient, model, matched[index]!, nextRows[index]!);
        }

        return nextRows.length;
      });
    },
    async upsert(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const lookup = requireUniqueLookup(model, args.where as Record<string, unknown>, "Upsert");
        validateUniqueLookupUpdateData(
          model,
          args.update as Partial<Record<string, unknown>>,
          lookup,
          "Upsert",
        );

        const current = await loadUniqueRow(
          activeClient,
          schema,
          modelName,
          args.where as Record<string, unknown>,
        );
        if (current && matchesModelWhere(model, current.data, args.where as Neo4jWhere)) {
          const rows = await loadRows(activeClient, schema, modelName);
          const next = buildUpdatedRow(
            model,
            current,
            args.update as Partial<Record<string, unknown>>,
          );
          const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
          if (conflict) {
            throw neo4jConstraintError(conflict);
          }

          await updateRecordWithLocks(activeClient, model, current, next);
          return projectRow(schema, activeClient, modelName, next.decoded, args.select);
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
        const rows = await loadRows(activeClient, schema, modelName);
        const conflict = findUniqueConflict(model, created.decoded, rows);
        if (conflict) {
          throw neo4jConstraintError(conflict);
        }

        await createRecordWithLocks(activeClient, modelName, created, model);
        return projectRow(schema, activeClient, modelName, created.decoded, args.select);
      });
    },
    async delete(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const row = applyModelQuery(model, await loadRows(activeClient, schema, modelName), {
          where: args.where as Neo4jWhere,
          take: 1,
        })[0];
        if (!row) return 0;

        await deleteRecordWithLocks(activeClient, model, row);
        return 1;
      });
    },
    async deleteMany(schema, modelName, args) {
      return withWriteScope(config.client, config.database, async (activeClient) => {
        const model = getSupportedManifest(schema).models[modelName];
        const rows = applyModelQuery(model, await loadRows(activeClient, schema, modelName), {
          where: args.where as Neo4jWhere,
        });

        for (const row of rows) {
          await deleteRecordWithLocks(activeClient, model, row);
        }

        return rows.length;
      });
    },
    async transaction(schema, run) {
      getSupportedManifest(schema);
      return withWriteScope(config.client, config.database, async (activeClient) =>
        run(
          createNeo4jDriverInternal({
            ...config,
            client: activeClient,
          }),
        ),
      );
    },
  };

  return driver;
}

export function createNeo4jDriver<TSchema extends SchemaDefinition<any>>(
  config: Neo4jDriverConfig<TSchema>,
): OrmDriver<TSchema, Neo4jDriverHandle<Neo4jDriverClient<TSchema>>> {
  return createNeo4jDriverInternal(config);
}
