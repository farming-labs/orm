import { randomUUID } from "node:crypto";
import {
  createDriverHandle,
  createManifest,
  type CountArgs,
  type CreateArgs,
  type CreateManyArgs,
  type DeleteArgs,
  type DeleteManyArgs,
  type FindManyArgs,
  type ManifestField,
  type ManifestModel,
  mergeUniqueLookupCreateData,
  type OrmDriver,
  type OrmDriverHandle,
  isOperatorFilterObject,
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

type MongoRow = Record<string, unknown>;
type MongoWhere = Where<Record<string, unknown>>;

type MongooseWriteResult = {
  modifiedCount?: number;
  matchedCount?: number;
  deletedCount?: number;
};

export type MongooseSessionLike = {
  withTransaction?<TResult>(run: () => Promise<TResult>): Promise<TResult>;
  startTransaction?(): void;
  commitTransaction?(): Promise<void>;
  abortTransaction?(): Promise<void>;
  endSession?(): Promise<void> | void;
};

export type MongooseSessionSourceLike = {
  startSession(): Promise<MongooseSessionLike>;
};

export type MongooseQueryLike<TResult> = {
  sort(sort: Record<string, 1 | -1>): MongooseQueryLike<TResult>;
  skip(value: number): MongooseQueryLike<TResult>;
  limit(value: number): MongooseQueryLike<TResult>;
  session(session: MongooseSessionLike): MongooseQueryLike<TResult>;
  lean(): MongooseQueryLike<TResult>;
  exec(): Promise<TResult>;
};

export type MongooseExecLike<TResult> = {
  session?(session: MongooseSessionLike): MongooseExecLike<TResult>;
  exec(): Promise<TResult>;
};

export type MongooseModelLike = {
  find(filter: Record<string, unknown>): MongooseQueryLike<MongoRow[]>;
  findOne(filter: Record<string, unknown>): MongooseQueryLike<MongoRow | null>;
  countDocuments(filter: Record<string, unknown>): Promise<number> | MongooseExecLike<number>;
  create(
    doc: MongoRow | MongoRow[],
    options?: { session?: MongooseSessionLike },
  ): Promise<MongoRow | MongoRow[]>;
  insertMany?(docs: MongoRow[], options?: { session?: MongooseSessionLike }): Promise<MongoRow[]>;
  updateMany(
    filter: Record<string, unknown>,
    update: { $set: MongoRow },
    options?: { session?: MongooseSessionLike },
  ): Promise<MongooseWriteResult> | MongooseExecLike<MongooseWriteResult>;
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: MongoRow; $setOnInsert?: MongoRow },
    options?: {
      upsert?: boolean;
      new?: boolean;
      returnDocument?: "after" | "before";
      session?: MongooseSessionLike;
    },
  ): MongooseQueryLike<MongoRow | null>;
  findOneAndDelete(
    filter: Record<string, unknown>,
    options?: { session?: MongooseSessionLike },
  ): MongooseQueryLike<MongoRow | null>;
  deleteMany(
    filter: Record<string, unknown>,
    options?: { session?: MongooseSessionLike },
  ): Promise<MongooseWriteResult> | MongooseExecLike<MongooseWriteResult>;
};

export type MongooseFieldTransform = {
  encode?: (value: unknown) => unknown;
  decode?: (value: unknown) => unknown;
};

export type MongooseDriverConfig<TSchema extends SchemaDefinition<any>> = {
  models: Record<ModelName<TSchema>, MongooseModelLike>;
  connection?: MongooseSessionSourceLike;
  startSession?: () => Promise<MongooseSessionLike>;
  transforms?: Partial<Record<string, Partial<Record<string, MongooseFieldTransform>>>>;
};

export type MongooseDriverClient<TSchema extends SchemaDefinition<any>> = {
  models: Record<ModelName<TSchema>, MongooseModelLike>;
  connection?: MongooseSessionSourceLike;
  startSession?: () => Promise<MongooseSessionLike>;
};

export type MongooseDriverHandle<TSchema extends SchemaDefinition<any>> = OrmDriverHandle<
  "mongoose",
  MongooseDriverClient<TSchema>
>;

const manifestCache = new WeakMap<object, SchemaManifest>();

function getManifest(schema: SchemaDefinition<any>) {
  const cached = manifestCache.get(schema);
  if (cached) return cached;
  const next = createManifest(schema);
  manifestCache.set(schema, next);
  return next;
}

function identityField(model: ManifestModel) {
  if (model.fields.id) return model.fields.id;
  const uniqueField = Object.values(model.fields).find((field) => field.unique);
  if (uniqueField) return uniqueField;
  throw new Error(
    `Model "${model.name}" requires an "id" field or a unique field for the Mongoose runtime.`,
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeWhere(...clauses: Array<MongoWhere | undefined>) {
  const defined = clauses.filter(Boolean) as MongoWhere[];
  if (!defined.length) return undefined;
  if (defined.length === 1) return defined[0];
  return {
    AND: defined,
  } as MongoWhere;
}

function parseReference(reference?: string) {
  if (!reference) return null;
  const [model, field] = reference.split(".");
  if (!model || !field) return null;
  return { model, field };
}

function removeOverlappingInsertFields(insertData: MongoRow, updateData: MongoRow) {
  const output: MongoRow = {};

  for (const [key, value] of Object.entries(insertData)) {
    if (Object.prototype.hasOwnProperty.call(updateData, key)) continue;
    output[key] = value;
  }

  return output;
}

function isExecLike<TResult>(value: unknown): value is MongooseExecLike<TResult> {
  return !!value && typeof value === "object" && "exec" in value;
}

async function execute<TResult>(
  operation: Promise<TResult> | MongooseExecLike<TResult>,
  session?: MongooseSessionLike,
) {
  if (isExecLike<TResult>(operation)) {
    const query =
      session && typeof operation.session === "function" ? operation.session(session) : operation;
    return query.exec();
  }
  return operation;
}

async function normalizeCreated(doc: Promise<MongoRow | MongoRow[]>) {
  const result = await doc;
  return Array.isArray(result) ? (result[0] ?? null) : result;
}

function createMongooseDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: MongooseDriverConfig<TSchema>,
  state: {
    session?: MongooseSessionLike;
  } = {},
): OrmDriver<TSchema, MongooseDriverHandle<TSchema>> {
  function getModel(modelName: ModelName<TSchema>) {
    const model = config.models[modelName];
    if (!model) {
      throw new Error(`No Mongoose model was provided for schema model "${modelName}".`);
    }
    return model;
  }

  function fieldTransform(modelName: string, fieldName: string) {
    return config.transforms?.[modelName]?.[fieldName];
  }

  function encodeValue(modelName: string, field: ManifestField, value: unknown) {
    if (value === undefined) return value;
    if (value === null) return null;

    let next = value;
    if (field.kind === "boolean") {
      next = Boolean(next);
    } else if (field.kind === "integer") {
      next = Number(next);
    } else if (field.kind === "datetime") {
      next = next instanceof Date ? next : new Date(String(next));
    }

    const transform = fieldTransform(modelName, field.name);
    return transform?.encode ? transform.encode(next) : next;
  }

  function decodeValue(modelName: string, field: ManifestField, value: unknown) {
    if (value === undefined) return value;
    if (value === null) return null;

    const transform = fieldTransform(modelName, field.name);
    let next = transform?.decode ? transform.decode(value) : value;

    if (field.kind === "boolean") {
      return Boolean(next);
    }
    if (field.kind === "integer") {
      return typeof next === "number" ? next : Number(next);
    }
    if (field.kind === "datetime") {
      return next instanceof Date ? next : new Date(String(next));
    }
    if (field.kind === "id") {
      return typeof next === "string" ? next : String(next);
    }
    return next;
  }

  function buildDocument(model: ManifestModel, data: Partial<Record<string, unknown>>) {
    const doc: MongoRow = {};

    for (const field of Object.values(model.fields)) {
      const value = applyDefault(data[field.name], field);
      if (value !== undefined) {
        doc[field.column] = encodeValue(model.name, field, value);
      }
    }

    return doc;
  }

  function buildUpdate(model: ManifestModel, data: Partial<Record<string, unknown>>) {
    const update: MongoRow = {};

    for (const [fieldName, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const field = model.fields[fieldName];
      if (!field) {
        throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
      }
      update[field.column] = encodeValue(model.name, field, value);
    }

    return update;
  }

  function decodeRow(model: ManifestModel, doc: MongoRow) {
    const output: MongoRow = {};

    for (const field of Object.values(model.fields)) {
      output[field.name] = decodeValue(model.name, field, doc[field.column]);
    }

    return output;
  }

  function compileFieldFilter(
    model: ManifestModel,
    fieldName: string,
    filter: unknown,
  ): Record<string, unknown> {
    const field = model.fields[fieldName];
    if (!field) {
      throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
    }

    if (!isOperatorFilterObject(filter)) {
      return {
        [field.column]: encodeValue(model.name, field, filter),
      };
    }

    const operations: Record<string, unknown> = {};

    if ("eq" in filter) {
      operations.$eq = encodeValue(model.name, field, filter.eq);
    }
    if ("not" in filter) {
      operations.$ne = encodeValue(model.name, field, filter.not);
    }
    if ("in" in filter) {
      const values = Array.isArray(filter.in) ? filter.in : [];
      operations.$in = values.map((value) => encodeValue(model.name, field, value));
    }
    if ("contains" in filter) {
      operations.$regex = new RegExp(escapeRegex(String(filter.contains ?? "")));
    }
    if ("gt" in filter) {
      operations.$gt = encodeValue(model.name, field, filter.gt);
    }
    if ("gte" in filter) {
      operations.$gte = encodeValue(model.name, field, filter.gte);
    }
    if ("lt" in filter) {
      operations.$lt = encodeValue(model.name, field, filter.lt);
    }
    if ("lte" in filter) {
      operations.$lte = encodeValue(model.name, field, filter.lte);
    }

    return {
      [field.column]: operations,
    };
  }

  function compileWhere(
    model: ManifestModel,
    where: MongoWhere | undefined,
  ): Record<string, unknown> {
    if (!where) return {};

    const clauses: Record<string, unknown>[] = [];

    for (const [key, value] of Object.entries(where)) {
      if (key === "AND") {
        const nested = (Array.isArray(value) ? value : [])
          .map((item) => compileWhere(model, item as MongoWhere))
          .filter((item) => Object.keys(item).length > 0);
        if (nested.length) clauses.push({ $and: nested });
        continue;
      }

      if (key === "OR") {
        const nested = (Array.isArray(value) ? value : [])
          .map((item) => compileWhere(model, item as MongoWhere))
          .filter((item) => Object.keys(item).length > 0);
        if (nested.length) clauses.push({ $or: nested });
        continue;
      }

      if (key === "NOT") {
        const nested = compileWhere(model, value as MongoWhere);
        if (Object.keys(nested).length) clauses.push({ $nor: [nested] });
        continue;
      }

      clauses.push(compileFieldFilter(model, key, value));
    }

    if (!clauses.length) return {};
    if (clauses.length === 1) return clauses[0]!;
    return {
      $and: clauses,
    };
  }

  function compileOrderBy(
    model: ManifestModel,
    orderBy: Partial<Record<string, "asc" | "desc">> | undefined,
  ) {
    if (!orderBy) return undefined;

    const output: Record<string, 1 | -1> = {};
    for (const [fieldName, direction] of Object.entries(orderBy)) {
      const field = model.fields[fieldName];
      if (!field) continue;
      output[field.column] = direction === "desc" ? -1 : 1;
    }

    return Object.keys(output).length ? output : undefined;
  }

  async function runFindMany(
    model: ManifestModel,
    args: {
      where?: MongoWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      take?: number;
      skip?: number;
    },
  ) {
    const query = getModel(model.name as ModelName<TSchema>).find(compileWhere(model, args.where));
    const orderBy = compileOrderBy(model, args.orderBy);
    if (orderBy) query.sort(orderBy);
    if (args.skip !== undefined) query.skip(args.skip);
    if (args.take !== undefined) query.limit(args.take);
    if (state.session) query.session(state.session);
    query.lean();
    return query.exec();
  }

  async function runFindOne(
    model: ManifestModel,
    args: {
      where?: MongoWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
    },
  ) {
    const orderBy = compileOrderBy(model, args.orderBy);
    if (orderBy) {
      const rows = await runFindMany(model, {
        ...args,
        take: 1,
      });
      return rows[0] ?? null;
    }

    const query = getModel(model.name as ModelName<TSchema>).findOne(
      compileWhere(model, args.where),
    );
    if (state.session) query.session(state.session);
    query.lean();
    return query.exec();
  }

  async function loadRows<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: MongoWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      take?: number;
      skip?: number;
      select?: TSelect;
    },
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>> {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const docs = await runFindMany(model, args);
    const rows = docs.map((doc) => decodeRow(model, doc));
    return Promise.all(rows.map((row) => projectRow(schema, modelName, row, args.select)));
  }

  async function loadOneRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: MongoWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      select?: TSelect;
    },
  ) {
    const rows = await loadRows(schema, modelName, {
      ...args,
      take: 1,
    });
    return rows[0] ?? null;
  }

  async function loadRawOneRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: MongoWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
    },
  ) {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const doc = await runFindOne(model, args);
    return doc ? decodeRow(model, doc) : null;
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: MongoRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const output: MongoRow = {};

    if (!select) {
      for (const fieldName of Object.keys(model.fields)) {
        output[fieldName] = row[fieldName];
      }
      return output as SelectedRecord<TSchema, TModelName, TSelect>;
    }

    for (const [key, value] of Object.entries(select)) {
      if (value === undefined) continue;

      if (key in model.fields && value === true) {
        output[key] = row[key];
        continue;
      }

      if (key in schema.models[modelName].relations) {
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
    row: MongoRow,
    value: true | FindManyArgs<TSchema, any, any>,
  ) {
    const manifest = getManifest(schema);
    const relation = schema.models[modelName].relations[relationName];
    const relationArgs = value === true ? {} : value;

    if (relation.kind === "belongsTo") {
      const foreignField = manifest.models[modelName].fields[relation.foreignKey];
      const targetReference = parseReference(foreignField?.references);
      const targetField =
        targetReference?.field ?? identityField(manifest.models[relation.target]).name;
      const foreignValue = row[relation.foreignKey];

      if (foreignValue == null) return null;

      return loadOneRow(schema, relation.target as ModelName<TSchema>, {
        where: mergeWhere(
          relationArgs.where as MongoWhere | undefined,
          {
            [targetField]: foreignValue,
          } as MongoWhere,
        ),
        orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
        select: relationArgs.select,
      });
    }

    if (relation.kind === "hasOne") {
      const targetModel = manifest.models[relation.target];
      const foreignField = targetModel.fields[relation.foreignKey];
      const sourceReference = parseReference(foreignField?.references);
      const sourceField = sourceReference?.field ?? identityField(manifest.models[modelName]).name;
      const sourceValue = row[sourceField];

      if (sourceValue == null) return null;

      return loadOneRow(schema, relation.target as ModelName<TSchema>, {
        where: mergeWhere(
          relationArgs.where as MongoWhere | undefined,
          {
            [relation.foreignKey]: sourceValue,
          } as MongoWhere,
        ),
        orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
        select: relationArgs.select,
      });
    }

    if (relation.kind === "hasMany") {
      const targetModel = manifest.models[relation.target];
      const foreignField = targetModel.fields[relation.foreignKey];
      const sourceReference = parseReference(foreignField?.references);
      const sourceField = sourceReference?.field ?? identityField(manifest.models[modelName]).name;
      const sourceValue = row[sourceField];

      if (sourceValue == null) return [];

      return loadRows(schema, relation.target as ModelName<TSchema>, {
        where: mergeWhere(
          relationArgs.where as MongoWhere | undefined,
          {
            [relation.foreignKey]: sourceValue,
          } as MongoWhere,
        ),
        orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
        take: relationArgs.take,
        skip: relationArgs.skip,
        select: relationArgs.select,
      });
    }

    const throughModel = manifest.models[relation.through];
    const throughFromReference = parseReference(throughModel.fields[relation.from]?.references);
    const throughToReference = parseReference(throughModel.fields[relation.to]?.references);
    const sourceField =
      throughFromReference?.field ?? identityField(manifest.models[modelName]).name;
    const targetField =
      throughToReference?.field ?? identityField(manifest.models[relation.target]).name;
    const sourceValue = row[sourceField];

    if (sourceValue == null) return [];

    const throughRows = await loadRows(schema, relation.through as ModelName<TSchema>, {
      where: {
        [relation.from]: sourceValue,
      } as MongoWhere,
    });

    const targetIds = throughRows
      .map((item: MongoRow) => item[relation.to])
      .filter((item) => item != null);
    if (!targetIds.length) return [];

    return loadRows(schema, relation.target as ModelName<TSchema>, {
      where: mergeWhere(
        relationArgs.where as MongoWhere | undefined,
        {
          [targetField]: {
            in: targetIds,
          },
        } as MongoWhere,
      ),
      orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
      take: relationArgs.take,
      skip: relationArgs.skip,
      select: relationArgs.select,
    });
  }

  async function runTransaction<TResult>(
    run: (driver: OrmDriver<TSchema, MongooseDriverHandle<TSchema>>) => Promise<TResult>,
  ) {
    if (state.session) {
      return run(createMongooseDriverInternal(config, state));
    }

    const startSession =
      config.startSession ?? config.connection?.startSession.bind(config.connection);
    if (!startSession) {
      return run(createMongooseDriverInternal(config, state));
    }

    const session = await startSession();
    try {
      if (session.withTransaction) {
        return await session.withTransaction(() =>
          run(
            createMongooseDriverInternal(config, {
              session,
            }),
          ),
        );
      }

      if (session.startTransaction && session.commitTransaction && session.abortTransaction) {
        session.startTransaction();
        try {
          const result = await run(
            createMongooseDriverInternal(config, {
              session,
            }),
          );
          await session.commitTransaction();
          return result;
        } catch (error) {
          await session.abortTransaction();
          throw error;
        }
      }

      return run(
        createMongooseDriverInternal(config, {
          session,
        }),
      );
    } finally {
      await session.endSession?.();
    }
  }

  const driver: OrmDriver<TSchema, MongooseDriverHandle<TSchema>> = {
    handle: createDriverHandle({
      kind: "mongoose",
      client: {
        models: config.models,
        connection: config.connection,
        startSession: config.startSession,
      },
      capabilities: {
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: Boolean(config.startSession ?? config.connection?.startSession),
      },
    }),
    async findMany(schema, model, args) {
      return loadRows(schema, model, args);
    },
    async findFirst(schema, model, args) {
      return loadOneRow(schema, model, args);
    },
    async findUnique(schema, model, args) {
      const manifest = getManifest(schema);
      requireUniqueLookup(
        manifest.models[model],
        args.where as Record<string, unknown>,
        "FindUnique",
      );
      return loadOneRow(schema, model, args);
    },
    async count(schema, model, args?: CountArgs<TSchema, ModelName<TSchema>>) {
      const manifest = getManifest(schema);
      const result = await execute(
        getModel(model).countDocuments(
          compileWhere(manifest.models[model], args?.where as MongoWhere | undefined),
        ),
        state.session,
      );
      return Number(result);
    },
    async create(schema, model, args) {
      const manifest = getManifest(schema);
      const document = buildDocument(
        manifest.models[model],
        args.data as Partial<Record<string, unknown>>,
      );
      const created = await normalizeCreated(
        state.session
          ? getModel(model).create([document], { session: state.session })
          : getModel(model).create(document),
      );
      if (!created) {
        throw new Error(`Create on model "${String(model)}" did not return a document.`);
      }
      const row = decodeRow(manifest.models[model], created);
      return projectRow(schema, model, row, args.select) as Promise<any>;
    },
    async createMany(schema, model, args) {
      const results: unknown[] = [];
      for (const entry of args.data) {
        results.push(
          await driver.create(schema, model, {
            data: entry,
            select: args.select,
          } as CreateArgs<TSchema, ModelName<TSchema>, any>),
        );
      }
      return results as any;
    },
    async update(schema, model, args) {
      const manifest = getManifest(schema);
      const updated = await getModel(model)
        .findOneAndUpdate(
          compileWhere(manifest.models[model], args.where as MongoWhere),
          {
            $set: buildUpdate(
              manifest.models[model],
              args.data as Partial<Record<string, unknown>>,
            ),
          },
          {
            new: true,
            returnDocument: "after",
            session: state.session,
          },
        )
        .lean()
        .exec();

      if (!updated) return null;

      return projectRow(
        schema,
        model,
        decodeRow(manifest.models[model], updated),
        args.select,
      ) as Promise<any>;
    },
    async updateMany(schema, model, args) {
      const manifest = getManifest(schema);
      const update = buildUpdate(
        manifest.models[model],
        args.data as Partial<Record<string, unknown>>,
      );
      if (!Object.keys(update).length) return 0;
      const result = await execute(
        getModel(model).updateMany(
          compileWhere(manifest.models[model], args.where as MongoWhere),
          {
            $set: update,
          },
          state.session ? { session: state.session } : undefined,
        ),
        state.session,
      );
      return Number(result.modifiedCount ?? result.matchedCount ?? 0);
    },
    async upsert(schema, model, args) {
      const manifest = getManifest(schema);
      const modelManifest = manifest.models[model];
      const lookup = requireUniqueLookup(
        modelManifest,
        args.where as Record<string, unknown>,
        "Upsert",
      );
      validateUniqueLookupUpdateData(
        modelManifest,
        args.update as Partial<Record<string, unknown>>,
        lookup,
        "Upsert",
      );
      const created = buildDocument(
        modelManifest,
        mergeUniqueLookupCreateData(
          modelManifest,
          args.create as Partial<Record<string, unknown>>,
          lookup,
          "Upsert",
        ),
      );
      const update = buildUpdate(modelManifest, args.update as Partial<Record<string, unknown>>);
      const updated = await getModel(model)
        .findOneAndUpdate(
          compileWhere(modelManifest, args.where as MongoWhere),
          {
            $set: update,
            $setOnInsert: removeOverlappingInsertFields(created, update),
          },
          {
            upsert: true,
            new: true,
            returnDocument: "after",
            session: state.session,
          },
        )
        .lean()
        .exec();

      if (!updated) {
        throw new Error(`Upsert on model "${String(model)}" did not return a document.`);
      }

      return projectRow(
        schema,
        model,
        decodeRow(modelManifest, updated),
        args.select,
      ) as Promise<any>;
    },
    async delete(schema, model, args) {
      const manifest = getManifest(schema);
      const deleted = await getModel(model)
        .findOneAndDelete(
          compileWhere(manifest.models[model], args.where as MongoWhere),
          state.session ? { session: state.session } : undefined,
        )
        .lean()
        .exec();
      return deleted ? 1 : 0;
    },
    async deleteMany(schema, model, args) {
      const manifest = getManifest(schema);
      const result = await execute(
        getModel(model).deleteMany(
          compileWhere(manifest.models[model], args.where as MongoWhere),
          state.session ? { session: state.session } : undefined,
        ),
        state.session,
      );
      return Number(result.deletedCount ?? 0);
    },
    async transaction(_schema, run) {
      return runTransaction(run);
    },
  };

  return driver;
}

export function createMongooseDriver<TSchema extends SchemaDefinition<any>>(
  config: MongooseDriverConfig<TSchema>,
) {
  return createMongooseDriverInternal(config);
}
