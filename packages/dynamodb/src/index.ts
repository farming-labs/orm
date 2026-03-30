import { randomUUID } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
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

type DynamoDbRow = Record<string, unknown>;
type DynamoDbWhere = Where<Record<string, unknown>>;
type DynamoDbSort = Partial<Record<string, "asc" | "desc">>;

const ormPrimaryKey = "__orm_pk";
const ormKindKey = "__orm_kind";
const ormTargetKey = "__orm_target";
const ormRecordKind = "record";
const ormUniqueKind = "unique";

export type DynamoDbBaseClientLike = {
  send(command: unknown): Promise<unknown>;
  destroy?(): void;
  config?: unknown;
};

export type DynamoDbDocumentClientLike = DynamoDbBaseClientLike;

export type DynamoDbTableMap<TSchema extends SchemaDefinition<any>> = Partial<
  Record<ModelName<TSchema>, string>
>;

export type DynamoDbFieldTransform = {
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
};

export type DynamoDbDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: DynamoDbBaseClientLike | DynamoDbDocumentClientLike;
  documentClient?: DynamoDbDocumentClientLike;
  tables?: DynamoDbTableMap<TSchema>;
  transforms?: Partial<Record<string, Partial<Record<string, DynamoDbFieldTransform>>>>;
};

export type DynamoDbDriverClient<TSchema extends SchemaDefinition<any>> = {
  client: DynamoDbBaseClientLike | DynamoDbDocumentClientLike;
  documentClient: DynamoDbDocumentClientLike;
  tables?: DynamoDbTableMap<TSchema>;
};

export type DynamoDbDriverHandle<TSchema extends SchemaDefinition<any>> = OrmDriverHandle<
  "dynamodb",
  DynamoDbDriverClient<TSchema>
>;

type LoadedRow = {
  docId: string;
  pk: string;
  data: DynamoDbRow;
  stored: DynamoDbRow;
};

type UniqueLock = {
  pk: string;
  target: string;
  fields: string[];
};

type DynamoDbStoredItem = Record<string, unknown>;

const manifestCache = new WeakMap<object, SchemaManifest>();

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

function isDocumentClientLike(
  client: DynamoDbBaseClientLike | DynamoDbDocumentClientLike,
): client is DynamoDbDocumentClientLike {
  const constructorName = client?.constructor?.name ?? "";
  return (
    constructorName.includes("DocumentClient") ||
    (isRecord(client.config) && "translateConfig" in client.config)
  );
}

function createDocumentClient(
  client: DynamoDbBaseClientLike | DynamoDbDocumentClientLike,
  override?: DynamoDbDocumentClientLike,
) {
  if (override) return override;
  if (isDocumentClientLike(client)) {
    return client;
  }

  return DynamoDBDocumentClient.from(client as any, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  }) as unknown as DynamoDbDocumentClientLike;
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

function sortRows(rows: LoadedRow[], orderBy?: DynamoDbSort) {
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

function dynamodbConstraintError(target?: string | string[]) {
  const fields = Array.isArray(target) ? target.join(", ") : (target ?? "unique fields");
  const error = new Error(`DynamoDB unique constraint violation on ${fields}.`);
  Object.assign(error, {
    code: "ConditionalCheckFailedException",
    target,
  });
  return error;
}

function isUnsupportedTransactionWrite(error: unknown) {
  if (!isRecord(error)) return false;
  return (
    error.name === "UnknownOperationException" ||
    error.code === "UnknownOperationException" ||
    String(error.message ?? "").includes("UnknownOperation")
  );
}

function recordPk(docId: string) {
  return `record#${docId}`;
}

function getStoredItemPk(item: DynamoDbStoredItem) {
  const value = item[ormPrimaryKey];
  return typeof value === "string" ? value : undefined;
}

function hasTransactionWriteSupport(client: DynamoDbDocumentClientLike) {
  return typeof client.send === "function";
}

export function normalizeDynamoDbDocumentClient(
  client: DynamoDbBaseClientLike | DynamoDbDocumentClientLike,
  documentClient?: DynamoDbDocumentClientLike,
) {
  return createDocumentClient(client, documentClient);
}

function createDynamoDbDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: DynamoDbDriverConfig<TSchema>,
): OrmDriver<TSchema, DynamoDbDriverHandle<TSchema>> {
  const documentClient = createDocumentClient(config.client, config.documentClient);

  function getSupportedManifest(schema: TSchema) {
    const manifest = getManifest(schema);

    for (const model of Object.values(manifest.models)) {
      if (model.schema) {
        throw new Error(
          `The DynamoDB runtime does not support schema-qualified tables for model "${model.name}". Use flat table names instead.`,
        );
      }

      const idField = model.fields.id;
      if (
        idField?.kind === "id" &&
        idField.idType === "integer" &&
        idField.generated === "increment"
      ) {
        throw new Error(
          `The DynamoDB runtime does not support generated integer ids for model "${model.name}". Use manual numeric ids or a string id instead.`,
        );
      }
    }

    return manifest;
  }

  function getTableName(schema: TSchema, modelName: ModelName<TSchema>) {
    const manifest = getSupportedManifest(schema);
    return config.tables?.[modelName] ?? manifest.models[modelName].table;
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
      return value instanceof Date ? value : new Date(value as string | number);
    }

    return value;
  }

  function buildStoredRow(model: ManifestModel, data: Partial<Record<string, unknown>>) {
    const stored: DynamoDbRow = {};
    const decoded: DynamoDbRow = {};

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
      if (idField.idType === "integer") {
        throw new Error(
          `The DynamoDB runtime requires an explicit numeric id for model "${model.name}" when using manual integer ids.`,
        );
      }

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
      if (field.name === "id" && !equalValues(current.data.id, value)) {
        throw new Error(
          `The DynamoDB runtime does not support updating the id field for model "${model.name}".`,
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

  async function scanAllItems(tableName: string) {
    const items: DynamoDbStoredItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = (await documentClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )) as { Items?: DynamoDbStoredItem[]; LastEvaluatedKey?: Record<string, unknown> };

      items.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
  }

  async function loadRowByPk(model: ManifestModel, tableName: string, pk: string) {
    const result = (await documentClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          [ormPrimaryKey]: pk,
        },
      }),
    )) as { Item?: DynamoDbStoredItem };
    const stored = result.Item;

    if (!stored || stored[ormKindKey] !== ormRecordKind) {
      return null;
    }

    const decoded: DynamoDbRow = {};
    const docId = pk.slice("record#".length);

    for (const field of Object.values(model.fields)) {
      decoded[field.name] = decodeValue(model.name, field, stored[field.column], docId);
    }

    return {
      docId,
      pk,
      data: decoded,
      stored,
    } satisfies LoadedRow;
  }

  async function loadRows<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
  ) {
    const model = getSupportedManifest(schema).models[modelName];
    const tableName = getTableName(schema, modelName);
    const items = await scanAllItems(tableName);

    return items
      .filter((item) => item[ormKindKey] === ormRecordKind)
      .map((stored) => {
        const pk = getStoredItemPk(stored) ?? "";
        const docId = pk.slice("record#".length);
        const decoded: DynamoDbRow = {};

        for (const field of Object.values(model.fields)) {
          decoded[field.name] = decodeValue(model.name, field, stored[field.column], docId);
        }

        return {
          docId,
          pk,
          data: decoded,
          stored,
        } satisfies LoadedRow;
      });
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

  function matchesModelWhere(model: ManifestModel, record: DynamoDbRow, where?: DynamoDbWhere) {
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
      where?: DynamoDbWhere;
      orderBy?: DynamoDbSort;
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

  function uniqueLockPk(model: ManifestModel, fields: string[], row: DynamoDbRow) {
    const values = fields.map((fieldName) => row[fieldName]);
    if (values.some((value) => value === undefined || value === null)) {
      return null;
    }

    const encodedValues = fields.map((fieldName) =>
      encodeURIComponent(serializeUniqueValue(model, fieldName, row[fieldName])),
    );

    return `unique#${model.name}#${fields.join("+")}#${encodedValues.join("#")}`;
  }

  function uniqueLocksForRow(model: ManifestModel, row: DynamoDbRow, docId: string) {
    const target = recordPk(docId);
    const locks: UniqueLock[] = [];

    for (const field of Object.values(model.fields)) {
      if (!field.unique) continue;
      const pk = uniqueLockPk(model, [field.name], row);
      if (!pk) continue;
      locks.push({
        pk,
        target,
        fields: [field.name],
      });
    }

    for (const constraint of model.constraints.unique) {
      const pk = uniqueLockPk(model, [...constraint.fields], row);
      if (!pk) continue;
      locks.push({
        pk,
        target,
        fields: [...constraint.fields],
      });
    }

    return locks;
  }

  async function loadUniqueRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    where: Record<string, unknown>,
  ) {
    const manifest = getSupportedManifest(schema);
    const model = manifest.models[modelName];
    const lookup = requireUniqueLookup(model, where, "FindUnique");
    const tableName = getTableName(schema, modelName);

    if (lookup.kind === "id") {
      return loadRowByPk(model, tableName, recordPk(String(lookup.values[lookup.fields[0]!.name])));
    }

    const normalizedLookupRow = Object.fromEntries(
      lookup.fields.map((field) => [
        field.name,
        decodeValue(model.name, field, encodeValue(model.name, field, lookup.values[field.name])),
      ]),
    );
    const lockPk = uniqueLockPk(
      model,
      lookup.fields.map((field) => field.name),
      normalizedLookupRow,
    );
    if (!lockPk) {
      return null;
    }

    const lockResult = (await documentClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          [ormPrimaryKey]: lockPk,
        },
      }),
    )) as { Item?: DynamoDbStoredItem };
    const target =
      typeof lockResult.Item?.[ormTargetKey] === "string"
        ? lockResult.Item[ormTargetKey]
        : undefined;
    if (!target) {
      return null;
    }

    return loadRowByPk(model, tableName, target);
  }

  function findUniqueConflict(
    model: ManifestModel,
    candidate: DynamoDbRow,
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

  function buildRecordItem(row: { docId: string; stored: DynamoDbRow }) {
    return {
      [ormPrimaryKey]: recordPk(row.docId),
      [ormKindKey]: ormRecordKind,
      ...row.stored,
    };
  }

  function putRecordCreateItem(tableName: string, row: { docId: string; stored: DynamoDbRow }) {
    return {
      Put: {
        TableName: tableName,
        Item: buildRecordItem(row),
        ConditionExpression: "attribute_not_exists(#pk)",
        ExpressionAttributeNames: {
          "#pk": ormPrimaryKey,
        },
      },
    };
  }

  function putRecordUpdateItem(tableName: string, row: { docId: string; stored: DynamoDbRow }) {
    return {
      Put: {
        TableName: tableName,
        Item: buildRecordItem(row),
      },
    };
  }

  function putUniqueItem(tableName: string, lock: UniqueLock) {
    return {
      Put: {
        TableName: tableName,
        Item: {
          [ormPrimaryKey]: lock.pk,
          [ormKindKey]: ormUniqueKind,
          [ormTargetKey]: lock.target,
        },
        ConditionExpression: "attribute_not_exists(#pk)",
        ExpressionAttributeNames: {
          "#pk": ormPrimaryKey,
        },
      },
    };
  }

  function deleteItem(tableName: string, pk: string) {
    return {
      Delete: {
        TableName: tableName,
        Key: {
          [ormPrimaryKey]: pk,
        },
      },
    };
  }

  async function putRecordSequential(
    tableName: string,
    row: { docId: string; stored: DynamoDbRow },
    conditionallyCreate: boolean,
  ) {
    await documentClient.send(
      new PutCommand({
        TableName: tableName,
        Item: buildRecordItem(row),
        ...(conditionallyCreate
          ? {
              ConditionExpression: "attribute_not_exists(#pk)",
              ExpressionAttributeNames: {
                "#pk": ormPrimaryKey,
              },
            }
          : {}),
      }),
    );
  }

  async function putUniqueSequential(tableName: string, lock: UniqueLock) {
    await documentClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          [ormPrimaryKey]: lock.pk,
          [ormKindKey]: ormUniqueKind,
          [ormTargetKey]: lock.target,
        },
        ConditionExpression: "attribute_not_exists(#pk)",
        ExpressionAttributeNames: {
          "#pk": ormPrimaryKey,
        },
      }),
    );
  }

  async function deleteSequential(tableName: string, pk: string) {
    await documentClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          [ormPrimaryKey]: pk,
        },
      }),
    );
  }

  async function createRecordWithLocks(
    tableName: string,
    row: { docId: string; stored: DynamoDbRow; decoded: DynamoDbRow },
    model: ManifestModel,
  ) {
    const locks = uniqueLocksForRow(model, row.decoded, row.docId);
    const transactItems = [
      putRecordCreateItem(tableName, row),
      ...locks.map((lock) => putUniqueItem(tableName, lock)),
    ];

    try {
      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        }),
      );
    } catch (error) {
      if (!isUnsupportedTransactionWrite(error)) {
        throw error;
      }

      await putRecordSequential(tableName, row, true);
      for (const lock of locks) {
        await putUniqueSequential(tableName, lock);
      }
    }
  }

  async function updateRecordWithLocks(
    tableName: string,
    model: ManifestModel,
    current: LoadedRow,
    next: { docId: string; stored: DynamoDbRow; decoded: DynamoDbRow },
  ) {
    const currentLocks = new Map(
      uniqueLocksForRow(model, current.data, current.docId).map((lock) => [lock.pk, lock]),
    );
    const nextLocks = new Map(
      uniqueLocksForRow(model, next.decoded, next.docId).map((lock) => [lock.pk, lock]),
    );
    const deleteOps = [...currentLocks.keys()]
      .filter((pk) => !nextLocks.has(pk))
      .map((pk) => deleteItem(tableName, pk));
    const putOps = [...nextLocks.entries()]
      .filter(([pk]) => !currentLocks.has(pk))
      .map(([, lock]) => putUniqueItem(tableName, lock));

    try {
      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: [putRecordUpdateItem(tableName, next), ...deleteOps, ...putOps],
        }),
      );
    } catch (error) {
      if (!isUnsupportedTransactionWrite(error)) {
        throw error;
      }

      await putRecordSequential(tableName, next, false);
      for (const operation of deleteOps) {
        await deleteSequential(tableName, operation.Delete.Key[ormPrimaryKey]);
      }
      for (const [, lock] of nextLocks.entries()) {
        if (!currentLocks.has(lock.pk)) {
          await putUniqueSequential(tableName, lock);
        }
      }
    }
  }

  async function deleteRecordWithLocks(
    tableName: string,
    model: ManifestModel,
    current: LoadedRow,
  ) {
    const locks = uniqueLocksForRow(model, current.data, current.docId);
    try {
      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            deleteItem(tableName, current.pk),
            ...locks.map((lock) => deleteItem(tableName, lock.pk)),
          ],
        }),
      );
    } catch (error) {
      if (!isUnsupportedTransactionWrite(error)) {
        throw error;
      }

      await deleteSequential(tableName, current.pk);
      for (const lock of locks) {
        await deleteSequential(tableName, lock.pk);
      }
    }
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: DynamoDbRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const modelDefinition = schema.models[modelName];
    const output: DynamoDbRow = {};

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
    row: DynamoDbRow,
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

  let driver!: OrmDriver<TSchema, DynamoDbDriverHandle<TSchema>>;

  driver = {
    handle: createDriverHandle({
      kind: "dynamodb",
      client: {
        client: config.client,
        documentClient,
        tables: config.tables,
      },
      capabilities: {
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: false,
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
      if (!row || !matchesModelWhere(model, row.data, args.where as DynamoDbWhere)) {
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
        throw dynamodbConstraintError(conflict);
      }

      await createRecordWithLocks(getTableName(schema, modelName), built, model);
      return projectRow(schema, modelName, built.decoded, args.select);
    },
    async createMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const existingRows = await loadRows(schema, modelName);
      const created: Array<{ docId: string; stored: DynamoDbRow; decoded: DynamoDbRow }> = [];

      for (const entry of args.data) {
        const built = buildStoredRow(model, entry as Partial<Record<string, unknown>>);
        const conflict = findUniqueConflict(model, built.decoded, [
          ...existingRows,
          ...created.map((row) => ({
            docId: row.docId,
            pk: recordPk(row.docId),
            data: row.decoded,
            stored: row.stored,
          })),
        ]);

        if (conflict) {
          throw dynamodbConstraintError(conflict);
        }

        created.push(built);
      }

      for (const row of created) {
        await createRecordWithLocks(getTableName(schema, modelName), row, model);
      }

      return Promise.all(
        created.map((row) => projectRow(schema, modelName, row.decoded, args.select)),
      );
    },
    async update(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const current = applyModelQuery(model, rows, {
        where: args.where as DynamoDbWhere,
        take: 1,
      })[0];
      if (!current) return null;

      const next = buildUpdatedRow(model, current, args.data as Partial<Record<string, unknown>>);
      const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
      if (conflict) {
        throw dynamodbConstraintError(conflict);
      }

      await updateRecordWithLocks(getTableName(schema, modelName), model, current, next);
      return projectRow(schema, modelName, next.decoded, args.select);
    },
    async updateMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = await loadRows(schema, modelName);
      const matched = applyModelQuery(model, rows, {
        where: args.where as DynamoDbWhere,
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
          throw dynamodbConstraintError(conflict);
        }

        pending.push({
          docId: next.docId,
          pk: recordPk(next.docId),
          data: next.decoded,
          stored: next.stored,
        });
      }

      for (let index = 0; index < matched.length; index += 1) {
        await updateRecordWithLocks(
          getTableName(schema, modelName),
          model,
          matched[index]!,
          nextRows[index]!,
        );
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
      if (current && matchesModelWhere(model, current.data, args.where as DynamoDbWhere)) {
        const rows = await loadRows(schema, modelName);
        const next = buildUpdatedRow(
          model,
          current,
          args.update as Partial<Record<string, unknown>>,
        );
        const conflict = findUniqueConflict(model, next.decoded, rows, new Set([current.docId]));
        if (conflict) {
          throw dynamodbConstraintError(conflict);
        }

        await updateRecordWithLocks(getTableName(schema, modelName), model, current, next);
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
        throw dynamodbConstraintError(conflict);
      }

      await createRecordWithLocks(getTableName(schema, modelName), created, model);
      return projectRow(schema, modelName, created.decoded, args.select);
    },
    async delete(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const row = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as DynamoDbWhere,
        take: 1,
      })[0];
      if (!row) return 0;

      await deleteRecordWithLocks(getTableName(schema, modelName), model, row);
      return 1;
    },
    async deleteMany(schema, modelName, args) {
      const model = getSupportedManifest(schema).models[modelName];
      const rows = applyModelQuery(model, await loadRows(schema, modelName), {
        where: args.where as DynamoDbWhere,
      });

      for (const row of rows) {
        await deleteRecordWithLocks(getTableName(schema, modelName), model, row);
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

export function createDynamodbDriver<TSchema extends SchemaDefinition<any>>(
  config: DynamoDbDriverConfig<TSchema>,
): OrmDriver<TSchema, DynamoDbDriverHandle<TSchema>> {
  return createDynamoDbDriverInternal(config);
}
