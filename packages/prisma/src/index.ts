import { randomUUID } from "node:crypto";
import {
  createManifest,
  type CountArgs,
  type CreateArgs,
  type CreateManyArgs,
  type DeleteArgs,
  type DeleteManyArgs,
  type FindManyArgs,
  type FindUniqueArgs,
  type ManifestField,
  type ManifestModel,
  mergeUniqueLookupCreateData,
  type OrmDriver,
  isOperatorFilterObject,
  requireUniqueLookup,
  resolveRowIdentityLookup,
  type SchemaManifest,
  type SchemaDefinition,
  type SelectShape,
  type SelectedRecord,
  type ManifestUniqueLookup,
  type UpdateArgs,
  type UpdateManyArgs,
  type UpsertArgs,
  validateUniqueLookupUpdateData,
  type Where,
} from "@farming-labs/orm";
import type { ModelName, RelationName } from "@farming-labs/orm";

type PrismaRow = Record<string, unknown>;
type PrismaWhere = Where<Record<string, unknown>>;

type PrismaWhereInput = Record<string, unknown>;

type PrismaDelegateLike = {
  findMany(args?: Record<string, unknown>): Promise<PrismaRow[]>;
  findFirst?(args?: Record<string, unknown>): Promise<PrismaRow | null>;
  count(args?: Record<string, unknown>): Promise<number>;
  create(args: { data: PrismaRow }): Promise<PrismaRow>;
  update?(args: { where: PrismaRow; data: PrismaRow }): Promise<PrismaRow>;
  updateMany(args: { where?: PrismaWhereInput; data: PrismaRow }): Promise<{ count?: number }>;
  upsert?(args: { where: PrismaRow; create: PrismaRow; update: PrismaRow }): Promise<PrismaRow>;
  delete?(args: { where: PrismaRow }): Promise<PrismaRow>;
  deleteMany(args: { where?: PrismaWhereInput }): Promise<{ count?: number }>;
};

export type PrismaClientLike = Record<string, PrismaDelegateLike> & {
  $transaction?<TResult>(run: (tx: PrismaClientLike) => Promise<TResult>): Promise<TResult>;
};

export type PrismaDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: PrismaClientLike;
  models?: Partial<Record<ModelName<TSchema>, string>>;
};

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
    `Model "${model.name}" requires an "id" field or a unique field for the Prisma runtime.`,
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

function parseReference(reference?: string) {
  if (!reference) return null;
  const [model, field] = reference.split(".");
  if (!model || !field) return null;
  return { model, field };
}

function mergeWhere(...clauses: Array<PrismaWhere | undefined>) {
  const defined = clauses.filter(Boolean) as PrismaWhere[];
  if (!defined.length) return undefined;
  if (defined.length === 1) return defined[0];
  return {
    AND: defined,
  } as PrismaWhere;
}

function buildCreateData(model: ManifestModel, input: Partial<Record<string, unknown>>) {
  const output: PrismaRow = {};

  for (const field of Object.values(model.fields)) {
    const value = applyDefault(input[field.name], field);
    if (value !== undefined) {
      output[field.name] = value;
    }
  }

  return output;
}

function buildUpdateData(input: Partial<Record<string, unknown>>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function compileFilter(field: ManifestField, filter: unknown) {
  if (!isOperatorFilterObject(filter)) {
    if (field.kind === "json" && filter !== null) {
      return {
        equals: filter,
      };
    }
    return filter;
  }

  const output: Record<string, unknown> = {};
  if ("eq" in filter) output.equals = filter.eq;
  if ("contains" in filter) output.contains = filter.contains;
  if ("in" in filter) output.in = filter.in;
  if ("not" in filter) output.not = filter.not;
  if ("gt" in filter) output.gt = filter.gt;
  if ("gte" in filter) output.gte = filter.gte;
  if ("lt" in filter) output.lt = filter.lt;
  if ("lte" in filter) output.lte = filter.lte;
  return output;
}

function compileWhere(model: ManifestModel, where?: PrismaWhere): PrismaWhereInput | undefined {
  if (!where) return undefined;

  const output: PrismaWhereInput = {};

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" && Array.isArray(value)) {
      output.AND = value
        .map((entry) => compileWhere(model, entry as PrismaWhere))
        .filter(Boolean) as PrismaWhereInput[];
      continue;
    }

    if (key === "OR" && Array.isArray(value)) {
      output.OR = value
        .map((entry) => compileWhere(model, entry as PrismaWhere))
        .filter(Boolean) as PrismaWhereInput[];
      continue;
    }

    if (key === "NOT" && value) {
      const compiled = compileWhere(model, value as PrismaWhere);
      if (compiled) output.NOT = compiled;
      continue;
    }

    if (!(key in model.fields)) continue;
    output[key] = compileFilter(model.fields[key]!, value);
  }

  return output;
}

function compileOrderBy(orderBy?: Partial<Record<string, "asc" | "desc">>) {
  if (!orderBy) return undefined;
  const entries = Object.entries(orderBy).filter(([, value]) => value);
  if (!entries.length) return undefined;
  return entries.map(([key, value]) => ({
    [key]: value,
  }));
}

function buildPrismaUniqueWhere(lookup: ManifestUniqueLookup) {
  if (lookup.fields.length === 1) {
    const field = lookup.fields[0]!;
    return {
      [field.name]: lookup.values[field.name],
    };
  }

  return {
    [lookup.fields.map((field) => field.name).join("_")]: Object.fromEntries(
      lookup.fields.map((field) => [field.name, lookup.values[field.name]]),
    ),
  };
}

function buildIdentityWhere(model: ManifestModel, row: PrismaRow) {
  return buildPrismaUniqueWhere(resolveRowIdentityLookup(model, row));
}

function createPrismaDriverInternal<TSchema extends SchemaDefinition<any>>(
  config: PrismaDriverConfig<TSchema>,
  state: {
    inTransaction?: boolean;
  } = {},
) {
  function getDelegate(modelName: ModelName<TSchema>) {
    const key = config.models?.[modelName] ?? modelName;
    const delegate = config.client[key];
    if (!delegate) {
      throw new Error(
        `Prisma delegate "${String(key)}" for model "${String(modelName)}" is missing.`,
      );
    }
    return delegate;
  }

  async function loadRows<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(schema: TSchema, modelName: TModelName, args: FindManyArgs<TSchema, TModelName, TSelect>) {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const rows = await getDelegate(modelName).findMany({
      where: compileWhere(model, args.where as PrismaWhere | undefined),
      orderBy: compileOrderBy(args.orderBy as Partial<Record<string, "asc" | "desc">> | undefined),
      take: args.take,
      skip: args.skip,
    });

    return Promise.all(rows.map((row) => projectRow(schema, modelName, row, args.select)));
  }

  async function loadRawOneRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: PrismaWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
    },
  ) {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const delegate = getDelegate(modelName);

    if (delegate.findFirst) {
      return delegate.findFirst({
        where: compileWhere(model, args.where),
        orderBy: compileOrderBy(args.orderBy),
      });
    }

    const rows = await delegate.findMany({
      where: compileWhere(model, args.where),
      orderBy: compileOrderBy(args.orderBy),
      take: 1,
    });
    return rows[0] ?? null;
  }

  async function loadOneRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: PrismaWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      select?: TSelect;
    },
  ) {
    const row = await loadRawOneRow(schema, modelName, args);
    return row ? projectRow(schema, modelName, row, args.select) : null;
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: PrismaRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const output: PrismaRow = {};

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
    row: PrismaRow,
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
          relationArgs.where as PrismaWhere | undefined,
          {
            [targetField]: foreignValue,
          } as PrismaWhere,
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
          relationArgs.where as PrismaWhere | undefined,
          {
            [relation.foreignKey]: sourceValue,
          } as PrismaWhere,
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
          relationArgs.where as PrismaWhere | undefined,
          {
            [relation.foreignKey]: sourceValue,
          } as PrismaWhere,
        ) as any,
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
      } as any,
    });

    const targetIds = throughRows
      .map((item: PrismaRow) => item[relation.to])
      .filter((item) => item != null);
    if (!targetIds.length) return [];

    return loadRows(schema, relation.target as ModelName<TSchema>, {
      where: mergeWhere(
        relationArgs.where as PrismaWhere | undefined,
        {
          [targetField]: {
            in: targetIds,
          },
        } as PrismaWhere,
      ) as any,
      orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
      take: relationArgs.take,
      skip: relationArgs.skip,
      select: relationArgs.select,
    });
  }

  async function runTransaction<TResult>(run: (driver: OrmDriver<TSchema>) => Promise<TResult>) {
    if (state.inTransaction || !config.client.$transaction) {
      return run(createPrismaDriverInternal(config, { inTransaction: true }));
    }

    return config.client.$transaction(async (tx) =>
      run(
        createPrismaDriverInternal(
          {
            ...config,
            client: tx,
          },
          {
            inTransaction: true,
          },
        ),
      ),
    );
  }

  const driver: OrmDriver<TSchema> = {
    async findMany(schema, model, args) {
      return loadRows(schema, model, args);
    },
    async findFirst(schema, model, args) {
      return loadOneRow(schema, model, args);
    },
    async findUnique(schema, model, args: FindUniqueArgs<TSchema, ModelName<TSchema>, any>) {
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
      return getDelegate(model).count({
        where: compileWhere(manifest.models[model], args?.where as PrismaWhere | undefined),
      });
    },
    async create(schema, model, args) {
      const manifest = getManifest(schema);
      const delegate = getDelegate(model);
      const row = await delegate.create({
        data: buildCreateData(
          manifest.models[model],
          args.data as Partial<Record<string, unknown>>,
        ),
      });
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
      const current = await loadRawOneRow(schema, model, {
        where: args.where as PrismaWhere,
      });

      if (!current) return null;

      const delegate = getDelegate(model);
      const identityWhere = buildIdentityWhere(manifest.models[model], current);
      const updateData = buildUpdateData(args.data as Partial<Record<string, unknown>>);
      const updated =
        delegate.update?.({
          where: identityWhere,
          data: updateData,
        }) ??
        (async () => {
          await delegate.updateMany({
            where: identityWhere,
            data: updateData,
          });
          return null;
        })();

      const row = await updated;
      const nextRow =
        row ??
        (await loadRawOneRow(schema, model, {
          where: identityWhere as PrismaWhere,
        }));
      if (!nextRow) return null;

      return projectRow(schema, model, nextRow, args.select) as Promise<any>;
    },
    async updateMany(schema, model, args) {
      const manifest = getManifest(schema);
      const result = await getDelegate(model).updateMany({
        where: compileWhere(manifest.models[model], args.where as PrismaWhere),
        data: buildUpdateData(args.data as Partial<Record<string, unknown>>),
      });
      return Number(result.count ?? 0);
    },
    async upsert(schema, model, args) {
      const manifest = getManifest(schema);
      const lookup = requireUniqueLookup(
        manifest.models[model],
        args.where as Record<string, unknown>,
        "Upsert",
      );
      const delegate = getDelegate(model);
      const createData = buildCreateData(
        manifest.models[model],
        mergeUniqueLookupCreateData(
          manifest.models[model],
          args.create as Partial<Record<string, unknown>>,
          lookup,
          "Upsert",
        ),
      );
      const updateData = buildUpdateData(args.update as Partial<Record<string, unknown>>);
      validateUniqueLookupUpdateData(
        manifest.models[model],
        args.update as Partial<Record<string, unknown>>,
        lookup,
        "Upsert",
      );

      const row = await (delegate.upsert?.({
        where: buildPrismaUniqueWhere(lookup),
        create: createData,
        update: updateData,
      }) ??
        runTransaction(async (txDriver) => {
          const existing = await txDriver.findUnique(schema, model, {
            where: args.where as any,
          } as FindUniqueArgs<TSchema, ModelName<TSchema>, undefined>);

          if (existing) {
            const updated = await txDriver.update(schema, model, {
              where: args.where as any,
              data: args.update as any,
            } as UpdateArgs<TSchema, ModelName<TSchema>, undefined>);
            if (!updated) {
              throw new Error(`Upsert on model "${String(model)}" failed during update.`);
            }
            return updated as PrismaRow;
          }

          return txDriver.create(schema, model, {
            data: createData as any,
          } as CreateArgs<TSchema, ModelName<TSchema>, undefined>) as Promise<PrismaRow>;
        }));

      return projectRow(schema, model, row, args.select) as Promise<any>;
    },
    async delete(schema, model, args) {
      const manifest = getManifest(schema);
      const current = await loadRawOneRow(schema, model, {
        where: args.where as PrismaWhere,
      });
      if (!current) return 0;

      const identityWhere = buildIdentityWhere(manifest.models[model], current);
      const delegate = getDelegate(model);

      if (delegate.delete) {
        await delegate.delete({
          where: identityWhere,
        });
        return 1;
      }

      const result = await delegate.deleteMany({
        where: identityWhere,
      });
      return Number(result.count ?? 0);
    },
    async deleteMany(schema, model, args) {
      const manifest = getManifest(schema);
      const result = await getDelegate(model).deleteMany({
        where: compileWhere(manifest.models[model], args.where as PrismaWhere),
      });
      return Number(result.count ?? 0);
    },
    async transaction(_schema, run) {
      return runTransaction(run);
    },
  };

  return driver;
}

export function createPrismaDriver<TSchema extends SchemaDefinition<any>>(
  config: PrismaDriverConfig<TSchema>,
) {
  return createPrismaDriverInternal(config);
}
