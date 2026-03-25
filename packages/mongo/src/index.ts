import { createManifest, type OrmDriver, type SchemaDefinition } from "@farming-labs/orm";
import type { ModelName } from "@farming-labs/orm";
import {
  createMongooseDriver,
  type MongooseDriverConfig,
  type MongooseExecLike,
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

export function createMongoDriver<TSchema extends SchemaDefinition<any>>(
  config: MongoDriverConfig<TSchema>,
): OrmDriver<TSchema> {
  const delegateCache = new WeakMap<object, OrmDriver<TSchema>>();

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
      transforms: config.transforms,
    });
    delegateCache.set(schema, driver);
    return driver;
  }

  return {
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
      return getDelegate(schema).transaction(schema, run);
    },
  };
}
