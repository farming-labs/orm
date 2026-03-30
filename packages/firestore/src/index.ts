import { randomUUID } from "node:crypto";
import {
  createDriverHandle,
  createManifest,
  equalValues,
  isOperatorFilterObject,
  mergeUniqueLookupCreateData,
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
  type OrmDriver,
  type OrmDriverHandle,
  requireUniqueLookup,
  type SchemaManifest,
  type SchemaDefinition,
  type SelectShape,
  type SelectedRecord,
  type UpdateArgs,
  type UpdateManyArgs,
  type UpsertArgs,
  validateUniqueLookupUpdateData,
  type Where,
} from "@farming-labs/orm";
import type { ModelName, RelationName } from "@farming-labs/orm";

type FirestoreRow = Record<string, unknown>;
type FirestoreWhere = Where<Record<string, unknown>>;

export type FirestoreDocumentSnapshotLike = {
  id: string;
  exists: boolean;
  data(): FirestoreRow | undefined;
  ref?: FirestoreDocumentReferenceLike;
};

export type FirestoreQuerySnapshotLike = {
  docs: FirestoreDocumentSnapshotLike[];
};

export type FirestoreQueryLike = {
  get(): Promise<FirestoreQuerySnapshotLike>;
};

export type FirestoreDocumentReferenceLike = {
  id: string;
  get(): Promise<FirestoreDocumentSnapshotLike>;
  set(data: FirestoreRow, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Partial<FirestoreRow>): Promise<unknown>;
  delete(): Promise<unknown>;
};

export type FirestoreCollectionLike = FirestoreQueryLike & {
  doc(id?: string): FirestoreDocumentReferenceLike;
  id?: string;
};

export type FirestoreTransactionLike = {
  get(
    target: FirestoreCollectionLike | FirestoreQueryLike | FirestoreDocumentReferenceLike,
  ): Promise<FirestoreQuerySnapshotLike | FirestoreDocumentSnapshotLike>;
  set(
    reference: FirestoreDocumentReferenceLike,
    data: FirestoreRow,
    options?: { merge?: boolean },
  ): unknown;
  update(reference: FirestoreDocumentReferenceLike, data: Partial<FirestoreRow>): unknown;
  delete(reference: FirestoreDocumentReferenceLike): unknown;
};

export type FirestoreDbLike = {
  collection(name: string): FirestoreCollectionLike;
  runTransaction?<TResult>(
    updateFunction: (transaction: FirestoreTransactionLike) => Promise<TResult>,
  ): Promise<TResult>;
  getAll?(...references: unknown[]): Promise<unknown[]>;
  batch?(): unknown;
};

export type FirestoreCollectionMap<TSchema extends SchemaDefinition<any>> = Partial<
  Record<ModelName<TSchema>, FirestoreCollectionLike>
>;

export type FirestoreFieldTransform = {
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
};

export type FirestoreDriverConfig<TSchema extends SchemaDefinition<any>> = {
  db: FirestoreDbLike;
  collections?: FirestoreCollectionMap<TSchema>;
  transforms?: Partial<Record<string, Partial<Record<string, FirestoreFieldTransform>>>>;
};

export type FirestoreDriverClient<TSchema extends SchemaDefinition<any>> = {
  db: FirestoreDbLike;
  collections?: FirestoreCollectionMap<TSchema>;
};

export type FirestoreDriverHandle<TSchema extends SchemaDefinition<any>> = OrmDriverHandle<
  "firestore",
  FirestoreDriverClient<TSchema>
>;

type LoadedRow = {
  docId: string;
  ref: FirestoreDocumentReferenceLike;
  data: FirestoreRow;
  stored: FirestoreRow;
};

const manifestCache = new WeakMap<object, SchemaManifest>();

function getManifest(schema: SchemaDefinition<any>) {
  const cached = manifestCache.get(schema);
  if (cached) return cached;
  const next = createManifest(schema);
  manifestCache.set(schema, next);
  return next;
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

function isTimestampLike(value: unknown): value is { toDate(): Date } {
  return (
    !!value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
  );
}

function applyDefault(value: unknown, field: ManifestField) {
  if (value !== undefined) return value;
  if (field.generated === "id") return randomUUID();
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

function matchesWhere<TRecord extends Record<string, unknown>>(
  record: TRecord,
  where?: FirestoreWhere,
) {
  if (!where) return true;

  if (where.AND && !where.AND.every((clause) => matchesWhere(record, clause))) {
    return false;
  }

  if (where.OR && !where.OR.some((clause) => matchesWhere(record, clause))) {
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

function sortRows(rows: LoadedRow[], orderBy?: Partial<Record<string, "asc" | "desc">>) {
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

function applyQuery(
  rows: LoadedRow[],
  args: {
    where?: FirestoreWhere;
    orderBy?: Partial<Record<string, "asc" | "desc">>;
    skip?: number;
    take?: number;
  } = {},
) {
  const filtered = rows.filter((row) => matchesWhere(row.data, args.where));
  const sorted = sortRows(filtered, args.orderBy);
  return pageRows(sorted, args.skip, args.take);
}

function firestoreConstraintError(target: string | string[]) {
  const fields = Array.isArray(target) ? target.join(", ") : target;
  const error = new Error(`Firestore unique constraint violation on ${fields}.`);
  Object.assign(error, {
    code: 6,
    details: error.message,
    target,
  });
  return error;
}

function normalizeDocumentId(value: unknown) {
  return value === undefined || value === null ? undefined : String(value);
}

function hasTransactionSupport(db: FirestoreDbLike) {
  return typeof db.runTransaction === "function";
}

function createFirestoreDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: FirestoreDriverConfig<TSchema>,
  state: {
    transaction?: FirestoreTransactionLike;
  } = {},
): OrmDriver<TSchema, FirestoreDriverHandle<TSchema>> {
  function getSupportedManifest(schema: TSchema) {
    const manifest = getManifest(schema);

    for (const model of Object.values(manifest.models)) {
      if (model.schema) {
        throw new Error(
          `The Firestore runtime does not support schema-qualified tables for model "${model.name}". Use flat collection names instead.`,
        );
      }

      const idField = model.fields.id;
      if (
        idField?.kind === "id" &&
        idField.idType === "integer" &&
        idField.generated === "increment"
      ) {
        throw new Error(
          `The Firestore runtime does not support generated integer ids for model "${model.name}". Use manual numeric ids or a string id instead.`,
        );
      }
    }

    return manifest;
  }

  function getCollection(schema: TSchema, modelName: ModelName<TSchema>) {
    const manifest = getSupportedManifest(schema);
    return (
      config.collections?.[modelName] ?? config.db.collection(manifest.models[modelName].table)
    );
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
      if (value instanceof Date) return value;
      if (isTimestampLike(value)) return value;
      return new Date(value as string | number);
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
      if (value instanceof Date) return value;
      if (isTimestampLike(value)) return value.toDate();
      return new Date(value as string | number);
    }

    return value;
  }

  function buildStoredRow(model: ManifestModel, data: Partial<Record<string, unknown>>) {
    const stored: FirestoreRow = {};
    const decoded: FirestoreRow = {};

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
        docId: randomUUID(),
        stored,
        decoded,
      };
    }

    let idValue = decoded[idField.name];
    if (idValue === undefined || idValue === null) {
      idValue = randomUUID();
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
      const encoded = encodeValue(model.name, field, value);
      stored[field.column] = encoded;
      decoded[field.name] = decodeValue(model.name, field, encoded);
    }

    const idField = model.fields.id;
    const docId =
      idField && decoded[idField.name] !== undefined && decoded[idField.name] !== null
        ? String(decoded[idField.name])
        : current.docId;

    return {
      docId,
      stored,
      decoded,
    };
  }

  async function getQuerySnapshot(
    query: FirestoreCollectionLike | FirestoreQueryLike,
  ): Promise<FirestoreQuerySnapshotLike> {
    if (state.transaction) {
      const result = await state.transaction.get(query);
      if ("docs" in result) {
        return result;
      }
      return {
        docs: result.exists ? [result] : [],
      };
    }

    return query.get();
  }

  async function getDocumentSnapshot(reference: FirestoreDocumentReferenceLike) {
    if (state.transaction) {
      const result = await state.transaction.get(reference);
      if ("exists" in result) {
        return result;
      }
      return (
        result.docs[0] ?? {
          id: reference.id,
          exists: false,
          data: () => undefined,
          ref: reference,
        }
      );
    }

    return reference.get();
  }

  async function loadRows<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
  ) {
    const model = getSupportedManifest(schema).models[modelName];
    const collection = getCollection(schema, modelName);
    const snapshot = await getQuerySnapshot(collection);

    return snapshot.docs
      .filter((doc) => doc.exists)
      .map((doc) => {
        const stored = doc.data() ?? {};
        const decoded: FirestoreRow = {};

        for (const field of Object.values(model.fields)) {
          decoded[field.name] = decodeValue(model.name, field, stored[field.column], doc.id);
        }

        return {
          docId: doc.id,
          ref: doc.ref ?? collection.doc(doc.id),
          data: decoded,
          stored,
        } satisfies LoadedRow;
      });
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
      const reference = getCollection(schema, modelName).doc(
        String(lookup.values[lookup.fields[0]!.name]),
      );
      const doc = await getDocumentSnapshot(reference);
      if (!doc.exists) return null;
      const stored = doc.data() ?? {};
      const decoded: FirestoreRow = {};

      for (const field of Object.values(model.fields)) {
        decoded[field.name] = decodeValue(model.name, field, stored[field.column], doc.id);
      }

      return {
        docId: doc.id,
        ref: doc.ref ?? reference,
        data: decoded,
        stored,
      } satisfies LoadedRow;
    }

    const rows = await loadRows(schema, modelName);
    return rows.find((row) => matchesWhere(row.data, where as FirestoreWhere)) ?? null;
  }

  function findUniqueConflict(
    model: ManifestModel,
    candidate: FirestoreRow,
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

  async function writeDocument(
    schema: TSchema,
    modelName: ModelName<TSchema>,
    next: { docId: string; stored: FirestoreRow },
    previousDocId?: string,
  ) {
    const collection = getCollection(schema, modelName);
    const reference = collection.doc(next.docId);

    if (state.transaction) {
      state.transaction.set(reference, next.stored);
      if (previousDocId && previousDocId !== next.docId) {
        state.transaction.delete(collection.doc(previousDocId));
      }
      return;
    }

    await reference.set(next.stored);
    if (previousDocId && previousDocId !== next.docId) {
      await collection.doc(previousDocId).delete();
    }
  }

  async function deleteDocument(schema: TSchema, modelName: ModelName<TSchema>, docId: string) {
    const reference = getCollection(schema, modelName).doc(docId);

    if (state.transaction) {
      state.transaction.delete(reference);
      return;
    }

    await reference.delete();
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: FirestoreRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const modelDefinition = schema.models[modelName];
    const output: FirestoreRow = {};

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
    row: FirestoreRow,
    value: true | FindManyArgs<TSchema, any, any>,
  ) {
    const relation = schema.models[modelName].relations[relationName];
    const relationArgs = value === true ? {} : value;

    if (relation.kind === "belongsTo") {
      const foreignValue = row[relation.foreignKey];
      const targetRows = (await loadRows(schema, relation.target as ModelName<TSchema>)).filter(
        (item) => equalValues(item.data.id, foreignValue),
      );
      const target = applyQuery(targetRows, relationArgs)[0];
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
      const target = applyQuery(targetRows, relationArgs)[0];
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
      const matchedRows = applyQuery(targetRows, relationArgs);
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
    const matchedRows = applyQuery(targetRows, relationArgs);

    return Promise.all(
      matchedRows.map((item) =>
        projectRow(schema, relation.target as ModelName<TSchema>, item.data, relationArgs.select),
      ),
    );
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

  function matchesModelWhere(
    model: ManifestModel,
    record: FirestoreRow,
    where?: FirestoreWhere,
  ): boolean {
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
      where?: FirestoreWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      skip?: number;
      take?: number;
    } = {},
  ) {
    const filtered = rows.filter((row) => matchesModelWhere(model, row.data, args.where));
    const sorted = sortRows(filtered, args.orderBy);
    return pageRows(sorted, args.skip, args.take);
  }

  async function runWrite<TResult>(run: () => Promise<TResult>) {
    if (state.transaction || !hasTransactionSupport(config.db)) {
      return run();
    }

    return config.db.runTransaction!(async (transaction) => {
      const txDriver = createFirestoreDriverInternal(config, {
        transaction,
      });
      return run.call({
        driver: txDriver,
      });
    });
  }

  let driver!: OrmDriver<TSchema, FirestoreDriverHandle<TSchema>>;

  driver = {
    handle: createDriverHandle({
      kind: "firestore",
      client: {
        db: config.db,
        collections: config.collections,
      },
      capabilities: {
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: hasTransactionSupport(config.db),
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
        upsert: "native",
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
      if (!row || !matchesModelWhere(model, row.data, args.where as FirestoreWhere)) {
        return null;
      }

      return projectRow(schema, modelName, row.data, args.select);
    },
    async count(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      return applyModelQuery(model, await loadRows(schema, modelName), args).length;
    },
    async create(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.create(schema, modelName, args);
        });
      }

      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const built = buildStoredRow(model, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, built.decoded, existingRows);

      if (conflict) {
        throw firestoreConstraintError(conflict);
      }

      await writeDocument(schema, modelName, built);
      return projectRow(schema, modelName, built.decoded, args.select);
    },
    async createMany(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.createMany(schema, modelName, args);
        });
      }

      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const created: Array<{ docId: string; stored: FirestoreRow; decoded: FirestoreRow }> = [];

      for (const entry of args.data) {
        const built = buildStoredRow(model, entry as Partial<Record<string, unknown>>);
        const conflict = findUniqueConflict(model, built.decoded, [
          ...existingRows,
          ...created.map((row) => ({
            docId: row.docId,
            ref: getCollection(schema, modelName).doc(row.docId),
            data: row.decoded,
            stored: row.stored,
          })),
        ]);

        if (conflict) {
          throw firestoreConstraintError(conflict);
        }

        created.push(built);
      }

      for (const row of created) {
        await writeDocument(schema, modelName, row);
      }

      return Promise.all(
        created.map((row) => projectRow(schema, modelName, row.decoded, args.select)),
      );
    },
    async update(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.update(schema, modelName, args);
        });
      }

      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const current = applyModelQuery(model, rows, {
        where: args.where as FirestoreWhere,
        take: 1,
      })[0];
      if (!current) return null;

      const next = buildUpdatedRow(model, current, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
      if (conflict) {
        throw firestoreConstraintError(conflict);
      }

      await writeDocument(schema, modelName, next, current.docId);
      return projectRow(schema, modelName, next.decoded, args.select);
    },
    async updateMany(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.updateMany(schema, modelName, args);
        });
      }

      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const matched = applyModelQuery(model, rows, {
        where: args.where as FirestoreWhere,
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
          throw firestoreConstraintError(conflict);
        }

        pending.push({
          docId: next.docId,
          ref: getCollection(schema, modelName).doc(next.docId),
          data: next.decoded,
          stored: next.stored,
        });
      }

      for (let index = 0; index < matched.length; index += 1) {
        await writeDocument(schema, modelName, nextRows[index]!, matched[index]!.docId);
      }

      return nextRows.length;
    },
    async upsert(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.upsert(schema, modelName, args);
        });
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
      if (current && matchesModelWhere(model, current.data, args.where as FirestoreWhere)) {
        const rows = await loadRows(schema, modelName);
        const next = buildUpdatedRow(
          model,
          current,
          args.update as Partial<Record<string, unknown>>,
        );
        const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
        if (conflict) {
          throw firestoreConstraintError(conflict);
        }

        await writeDocument(schema, modelName, next, current.docId);
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
        throw firestoreConstraintError(conflict);
      }

      await writeDocument(schema, modelName, created);
      return projectRow(schema, modelName, created.decoded, args.select);
    },
    async delete(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.delete(schema, modelName, args);
        });
      }

      const model = getSupportedManifest(schema).models[modelName];
      const row = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as FirestoreWhere,
        take: 1,
      })[0];
      if (!row) return 0;

      await deleteDocument(schema, modelName, row.docId);
      return 1;
    },
    async deleteMany(schema, modelName, args) {
      if (!state.transaction && hasTransactionSupport(config.db)) {
        return config.db.runTransaction!(async (transaction) => {
          const txDriver = createFirestoreDriverInternal(config, {
            transaction,
          });
          return txDriver.deleteMany(schema, modelName, args);
        });
      }

      const model = getSupportedManifest(schema).models[modelName];
      const rows = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as FirestoreWhere,
      });

      for (const row of rows) {
        await deleteDocument(schema, modelName, row.docId);
      }

      return rows.length;
    },
    async transaction(schema, run) {
      getSupportedManifest(schema);

      if (state.transaction || !hasTransactionSupport(config.db)) {
        return run(driver);
      }

      return config.db.runTransaction!(async (transaction) => {
        const txDriver = createFirestoreDriverInternal(config, {
          transaction,
        });
        return run(txDriver);
      });
    },
  };

  return driver;
}

export function createFirestoreDriver<TSchema extends SchemaDefinition<any>>(
  config: FirestoreDriverConfig<TSchema>,
): OrmDriver<TSchema, FirestoreDriverHandle<TSchema>> {
  return createFirestoreDriverInternal(config);
}
