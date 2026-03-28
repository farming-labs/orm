import {
  createDriverHandle,
  createManifest,
  type ManifestField,
  type OrmDriver,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
import type { ModelName } from "@farming-labs/orm";
import { Decimal128, Long } from "mongodb";
import {
  createMongooseDriver,
  type MongooseDriverConfig,
  type MongooseExecLike,
  type MongooseFieldTransform,
  type MongooseModelLike,
  type MongooseQueryLike,
  type MongooseSessionLike,
  type MongooseSessionSourceLike,
} from "@farming-labs/orm-mongoose";

type MongoRow = Record<string, unknown>;
type MongoSort = Record<string, 1 | -1>;

export type MongoSessionLike = MongooseSessionLike;
export type MongoSessionSourceLike = MongooseSessionSourceLike;

export type MongoCursorLike<TResult = MongoRow> = {
  sort(sort: MongoSort): MongoCursorLike<TResult>;
  skip(value: number): MongoCursorLike<TResult>;
  limit(value: number): MongoCursorLike<TResult>;
  toArray(): Promise<TResult[]>;
};

export type MongoCollectionLike = {
  collectionName?: string;
  find(filter: Record<string, unknown>, options?: { session?: MongoSessionLike }): MongoCursorLike;
  findOne(
    filter: Record<string, unknown>,
    options?: { session?: MongoSessionLike },
  ): Promise<MongoRow | null>;
  countDocuments(
    filter: Record<string, unknown>,
    options?: { session?: MongoSessionLike },
  ): Promise<number>;
  insertOne(
    doc: MongoRow,
    options?: { session?: MongoSessionLike },
  ): Promise<{ insertedId?: unknown }>;
  insertMany?(
    docs: MongoRow[],
    options?: { session?: MongoSessionLike },
  ): Promise<{ insertedIds?: Record<number, unknown> } | unknown>;
  updateMany(
    filter: Record<string, unknown>,
    update: { $set: MongoRow },
    options?: { session?: MongoSessionLike },
  ): Promise<{ modifiedCount?: number; matchedCount?: number }>;
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: MongoRow; $setOnInsert?: MongoRow },
    options?: {
      upsert?: boolean;
      returnDocument?: "after" | "before";
      session?: MongoSessionLike;
    },
  ): Promise<MongoRow | null | { value: MongoRow | null }>;
  findOneAndDelete(
    filter: Record<string, unknown>,
    options?: { session?: MongoSessionLike },
  ): Promise<MongoRow | null | { value: MongoRow | null }>;
  deleteMany(
    filter: Record<string, unknown>,
    options?: { session?: MongoSessionLike },
  ): Promise<{ deletedCount?: number }>;
};

export type MongoDbLike = {
  collection(name: string): MongoCollectionLike;
};

export type MongoCollectionMap<TSchema extends SchemaDefinition<any>> = Partial<
  Record<ModelName<TSchema>, MongoCollectionLike>
>;

export type MongoDriverConfig<TSchema extends SchemaDefinition<any>> = {
  collections?: MongoCollectionMap<TSchema>;
  db?: MongoDbLike;
  client?: MongoSessionSourceLike;
  startSession?: () => Promise<MongoSessionLike>;
  transforms?: MongooseDriverConfig<TSchema>["transforms"];
};

export type MongoDriverClient<TSchema extends SchemaDefinition<any>> = {
  collections?: MongoCollectionMap<TSchema>;
  db?: MongoDbLike;
  client?: MongoSessionSourceLike;
  startSession?: () => Promise<MongoSessionLike>;
};

export type MongoDriverHandle<TSchema extends SchemaDefinition<any>> = OrmDriverHandle<
  "mongo",
  MongoDriverClient<TSchema>
>;

class MongoExec<TResult> implements MongooseExecLike<TResult> {
  private currentSession?: MongoSessionLike;

  constructor(private readonly run: (session?: MongoSessionLike) => Promise<TResult>) {}

  session(session: MongoSessionLike) {
    this.currentSession = session;
    return this;
  }

  exec() {
    return this.run(this.currentSession);
  }
}

class MongoQuery<TResult> implements MongooseQueryLike<TResult> {
  private currentSession?: MongoSessionLike;
  private sortOrder?: MongoSort;
  private skipValue?: number;
  private limitValue?: number;

  constructor(
    private readonly run: (input: {
      session?: MongoSessionLike;
      sort?: MongoSort;
      skip?: number;
      limit?: number;
    }) => Promise<TResult>,
  ) {}

  sort(sort: MongoSort) {
    this.sortOrder = sort;
    return this;
  }

  skip(value: number) {
    this.skipValue = value;
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  session(session: MongoSessionLike) {
    this.currentSession = session;
    return this;
  }

  lean() {
    return this;
  }

  exec() {
    return this.run({
      session: this.currentSession,
      sort: this.sortOrder,
      skip: this.skipValue,
      limit: this.limitValue,
    });
  }
}

function normalizeFindOneResult(result: MongoRow | null | { value: MongoRow | null }) {
  if (result && typeof result === "object" && "value" in result) {
    return result.value ?? null;
  }
  return result ?? null;
}

function resolveCollections<TSchema extends SchemaDefinition<any>>(
  schema: TSchema,
  config: MongoDriverConfig<TSchema>,
) {
  const manifest = createManifest(schema);
  const collections = {} as Record<ModelName<TSchema>, MongoCollectionLike>;

  for (const modelName of Object.keys(schema.models) as Array<ModelName<TSchema>>) {
    const collection =
      config.collections?.[modelName] ?? config.db?.collection(manifest.models[modelName].table);

    if (!collection) {
      throw new Error(
        `No MongoDB collection was provided for schema model "${String(modelName)}". Pass "collections" or "db".`,
      );
    }

    collections[modelName] = collection;
  }

  return collections;
}

function adaptCollection(collection: MongoCollectionLike): MongooseModelLike {
  return {
    find(filter) {
      return new MongoQuery(async ({ session, sort, skip, limit }) => {
        let cursor = collection.find(filter, session ? { session } : undefined);
        if (sort) cursor = cursor.sort(sort);
        if (skip !== undefined) cursor = cursor.skip(skip);
        if (limit !== undefined) cursor = cursor.limit(limit);
        return cursor.toArray();
      });
    },
    findOne(filter) {
      return new MongoQuery(async ({ session, sort, skip, limit }) => {
        if (!sort && skip === undefined && limit === undefined) {
          return collection.findOne(filter, session ? { session } : undefined);
        }

        let cursor = collection.find(filter, session ? { session } : undefined);
        if (sort) cursor = cursor.sort(sort);
        if (skip !== undefined) cursor = cursor.skip(skip);
        cursor = cursor.limit(limit ?? 1);
        const rows = await cursor.toArray();
        return rows[0] ?? null;
      });
    },
    countDocuments(filter) {
      return new MongoExec((session) =>
        collection.countDocuments(filter, session ? { session } : undefined),
      );
    },
    async create(doc, options) {
      if (Array.isArray(doc)) {
        if (doc.length === 0) return [];

        if (collection.insertMany) {
          const result = await collection.insertMany(
            doc,
            options?.session ? { session: options.session } : undefined,
          );
          const insertedIds =
            result &&
            typeof result === "object" &&
            "insertedIds" in result &&
            result.insertedIds &&
            typeof result.insertedIds === "object"
              ? (result.insertedIds as Record<number, unknown>)
              : undefined;

          return doc.map((entry, index) => {
            const insertedId = insertedIds?.[index];

            if (entry._id === undefined && insertedId !== undefined) {
              return {
                ...entry,
                _id: insertedId,
              };
            }

            return entry;
          });
        }

        const created: MongoRow[] = [];
        for (const entry of doc) {
          created.push((await this.create(entry, options)) as MongoRow);
        }
        return created;
      }

      const result = await collection.insertOne(
        doc,
        options?.session ? { session: options.session } : undefined,
      );
      if (doc._id === undefined && result?.insertedId !== undefined) {
        return {
          ...doc,
          _id: result.insertedId,
        };
      }
      return doc;
    },
    async insertMany(docs, options) {
      if (collection.insertMany) {
        await collection.insertMany(
          docs,
          options?.session ? { session: options.session } : undefined,
        );
        return docs;
      }

      for (const doc of docs) {
        await collection.insertOne(
          doc,
          options?.session ? { session: options.session } : undefined,
        );
      }

      return docs;
    },
    updateMany(filter, update, options) {
      return new MongoExec((session) =>
        collection.updateMany(filter, update, {
          session: options?.session ?? session,
        }),
      );
    },
    findOneAndUpdate(filter, update, options) {
      return new MongoQuery<MongoRow | null>(async ({ session }) => {
        const result = await collection.findOneAndUpdate(filter, update, {
          upsert: options?.upsert,
          returnDocument: options?.returnDocument ?? (options?.new ? "after" : "before"),
          session: options?.session ?? session,
        });
        return normalizeFindOneResult(result) as MongoRow | null;
      });
    },
    findOneAndDelete(filter, options) {
      return new MongoQuery<MongoRow | null>(async ({ session }) => {
        const result = await collection.findOneAndDelete(filter, {
          session: options?.session ?? session,
        });
        return normalizeFindOneResult(result) as MongoRow | null;
      });
    },
    deleteMany(filter, options) {
      return new MongoExec((session) =>
        collection.deleteMany(filter, {
          session: options?.session ?? session,
        }),
      );
    },
  };
}

function mergeModelTransforms(
  base: Partial<Record<string, Partial<Record<string, MongooseFieldTransform>>>>,
  extra: Partial<Record<string, Partial<Record<string, MongooseFieldTransform>>>>,
) {
  const output = { ...base };

  for (const [modelName, fieldTransforms] of Object.entries(extra)) {
    output[modelName] = {
      ...(output[modelName] ?? {}),
      ...(fieldTransforms ?? {}),
    };
  }

  return output;
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

function defaultMongoFieldTransform(field: ManifestField) {
  if (field.kind === "bigint") {
    return {
      encode(value: unknown) {
        if (value === undefined || value === null) return value;
        const next = typeof value === "bigint" ? value : BigInt(value as string | number);
        return Long.fromString(next.toString());
      },
      decode(value: unknown) {
        if (value === undefined || value === null) return value;
        if (typeof value === "bigint") return value;
        if (typeof value === "number") return BigInt(Math.trunc(value));
        return BigInt(String(value));
      },
    };
  }

  if (field.kind === "decimal") {
    return {
      encode(value: unknown) {
        if (value === undefined || value === null) return value;
        return Decimal128.fromString(typeof value === "string" ? value : String(value));
      },
      decode(value: unknown) {
        if (value === undefined || value === null) return value;
        return normalizeDecimalString(typeof value === "string" ? value : String(value));
      },
    };
  }

  return null;
}

function buildDefaultMongoTransforms<TSchema extends SchemaDefinition<any>>(schema: TSchema) {
  const manifest = createManifest(schema);
  const output: NonNullable<MongoDriverConfig<TSchema>["transforms"]> = {};

  for (const model of Object.values(manifest.models)) {
    const fieldTransforms = Object.fromEntries(
      Object.values(model.fields)
        .map((field) => {
          const transform = defaultMongoFieldTransform(field);
          return transform ? [field.name, transform] : null;
        })
        .filter(
          (entry): entry is [string, NonNullable<ReturnType<typeof defaultMongoFieldTransform>>] =>
            entry !== null,
        ),
    );

    if (Object.keys(fieldTransforms).length) {
      output[model.name as ModelName<TSchema>] = fieldTransforms;
    }
  }

  return output;
}

export function createMongoDriver<TSchema extends SchemaDefinition<any>>(
  config: MongoDriverConfig<TSchema>,
): OrmDriver<TSchema, MongoDriverHandle<TSchema>> {
  const handle: MongoDriverHandle<TSchema> = createDriverHandle({
    kind: "mongo",
    client: {
      collections: config.collections,
      db: config.db,
      client: config.client,
      startSession: config.startSession,
    },
    capabilities: {
      numericIds: "manual",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsTransactions: Boolean(config.startSession ?? config.client?.startSession),
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
  });
  const delegateCache = new WeakMap<object, OrmDriver<TSchema, any>>();

  function wrapDelegate(
    delegate: OrmDriver<TSchema, any>,
  ): OrmDriver<TSchema, MongoDriverHandle<TSchema>> {
    return {
      handle,
      findMany(schema, model, args) {
        return delegate.findMany(schema, model, args);
      },
      findFirst(schema, model, args) {
        return delegate.findFirst(schema, model, args);
      },
      findUnique(schema, model, args) {
        return delegate.findUnique(schema, model, args);
      },
      count(schema, model, args) {
        return delegate.count(schema, model, args);
      },
      create(schema, model, args) {
        return delegate.create(schema, model, args);
      },
      createMany(schema, model, args) {
        return delegate.createMany(schema, model, args);
      },
      update(schema, model, args) {
        return delegate.update(schema, model, args);
      },
      updateMany(schema, model, args) {
        return delegate.updateMany(schema, model, args);
      },
      upsert(schema, model, args) {
        return delegate.upsert(schema, model, args);
      },
      delete(schema, model, args) {
        return delegate.delete(schema, model, args);
      },
      deleteMany(schema, model, args) {
        return delegate.deleteMany(schema, model, args);
      },
      transaction(schema, run) {
        return delegate.transaction(schema, async (txDriver) => run(wrapDelegate(txDriver)));
      },
    };
  }

  function getDelegate(schema: TSchema) {
    const cached = delegateCache.get(schema);
    if (cached) return cached;

    const collections = resolveCollections(schema, config);
    const models = Object.fromEntries(
      Object.entries(collections).map(([modelName, collection]) => [
        modelName,
        adaptCollection(collection),
      ]),
    ) as Record<ModelName<TSchema>, MongooseModelLike>;

    const driver = createMongooseDriver<TSchema>({
      models,
      connection: config.client,
      startSession: config.startSession,
      transforms: mergeModelTransforms(
        buildDefaultMongoTransforms(schema),
        config.transforms ?? {},
      ),
    });
    delegateCache.set(schema, driver);
    return driver;
  }

  return {
    handle,
    findMany(schema, model, args) {
      return getDelegate(schema).findMany(schema, model, args);
    },
    findFirst(schema, model, args) {
      return getDelegate(schema).findFirst(schema, model, args);
    },
    findUnique(schema, model, args) {
      return getDelegate(schema).findUnique(schema, model, args);
    },
    count(schema, model, args) {
      return getDelegate(schema).count(schema, model, args);
    },
    create(schema, model, args) {
      return getDelegate(schema).create(schema, model, args);
    },
    createMany(schema, model, args) {
      return getDelegate(schema).createMany(schema, model, args);
    },
    update(schema, model, args) {
      return getDelegate(schema).update(schema, model, args);
    },
    updateMany(schema, model, args) {
      return getDelegate(schema).updateMany(schema, model, args);
    },
    upsert(schema, model, args) {
      return getDelegate(schema).upsert(schema, model, args);
    },
    delete(schema, model, args) {
      return getDelegate(schema).delete(schema, model, args);
    },
    deleteMany(schema, model, args) {
      return getDelegate(schema).deleteMany(schema, model, args);
    },
    transaction(schema, run) {
      return getDelegate(schema).transaction(schema, async (txDriver) =>
        run(wrapDelegate(txDriver)),
      );
    },
  };
}
