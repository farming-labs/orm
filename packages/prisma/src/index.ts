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
  type FindUniqueArgs,
  type ManifestField,
  type ManifestModel,
  mergeUniqueLookupCreateData,
  type OrmDriver,
  type OrmDriverHandle,
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

const pluralize = (value: string) => (value.endsWith("s") ? value : `${value}s`);

type PrismaDelegateLike = {
  findMany(args?: Record<string, unknown>): Promise<PrismaRow[]>;
  findFirst?(args?: Record<string, unknown>): Promise<PrismaRow | null>;
  count(args?: Record<string, unknown>): Promise<number>;
  create(args: { data: PrismaRow } & Record<string, unknown>): Promise<PrismaRow>;
  update?(
    args: { where: PrismaRow; data: PrismaRow } & Record<string, unknown>,
  ): Promise<PrismaRow>;
  updateMany(args: { where?: PrismaWhereInput; data: PrismaRow }): Promise<{ count?: number }>;
  upsert?(
    args: { where: PrismaRow; create: PrismaRow; update: PrismaRow } & Record<string, unknown>,
  ): Promise<PrismaRow>;
  delete?(args: { where: PrismaRow } & Record<string, unknown>): Promise<PrismaRow>;
  deleteMany(args: { where?: PrismaWhereInput }): Promise<{ count?: number }>;
};

export type PrismaClientLike = Record<string, PrismaDelegateLike> & {
  $transaction?<TResult>(run: (tx: PrismaClientLike) => Promise<TResult>): Promise<TResult>;
};

export type PrismaDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: PrismaClientLike;
  models?: Partial<Record<ModelName<TSchema>, string>>;
};

export type PrismaDriverHandle = OrmDriverHandle<"prisma", PrismaClientLike>;

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

function supportsNativePrismaManyToManyArgs(args: Partial<FindManyArgs<any, any, any>>) {
  return (
    args.where === undefined &&
    args.orderBy === undefined &&
    args.take === undefined &&
    args.skip === undefined
  );
}

function prismaManyToManyJoinKeys(relation: { through: string; target: string }) {
  return {
    throughRelationName: pluralize(relation.through),
    targetRelationName: relation.target,
  };
}

function compilePrismaSelect<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
>(schema: TSchema, modelName: TModelName, select: SelectShape<TSchema, TModelName>) {
  const manifest = getManifest(schema);
  const model = manifest.models[modelName];
  const output: Record<string, unknown> = {};
  const hiddenScalarKeys = new Set<string>();

  for (const [key, value] of Object.entries(select)) {
    if (value === undefined) continue;

    if (key in model.fields && value === true) {
      output[key] = true;
      continue;
    }

    if (!(key in schema.models[modelName].relations)) continue;

    const relation = schema.models[modelName].relations[key as RelationName<TSchema, TModelName>];
    const relationArgs = (value === true ? {} : value) as Partial<FindManyArgs<TSchema, any, any>>;
    if (relation.kind === "manyToMany") {
      if (supportsNativePrismaManyToManyArgs(relationArgs)) {
        const targetModel = relation.target as ModelName<TSchema>;
        const { throughRelationName, targetRelationName } = prismaManyToManyJoinKeys(relation);
        output[throughRelationName] = {
          select: {
            [targetRelationName]: relationArgs.select
              ? {
                  select: compilePrismaSelect(schema, targetModel, relationArgs.select as any),
                }
              : true,
          },
        };
        continue;
      }

      const throughModel = manifest.models[relation.through];
      const throughFromReference = parseReference(throughModel.fields[relation.from]?.references);
      hiddenScalarKeys.add(
        throughFromReference?.field ?? identityField(manifest.models[modelName]).name,
      );
      continue;
    }

    if (value === true) {
      output[key] = true;
      continue;
    }
    const targetModel = relation.target as ModelName<TSchema>;
    const next: Record<string, unknown> = {};
    if (relationArgs.where) {
      next.where = compileWhere(
        manifest.models[targetModel],
        relationArgs.where as PrismaWhere | undefined,
      );
    }
    if (relationArgs.orderBy) {
      next.orderBy = compileOrderBy(
        relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
      );
    }
    if (relationArgs.take !== undefined) next.take = relationArgs.take;
    if (relationArgs.skip !== undefined) next.skip = relationArgs.skip;
    if (relationArgs.select) {
      next.select = compilePrismaSelect(schema, targetModel, relationArgs.select as any);
    }

    output[key] = Object.keys(next).length ? next : true;
  }

  for (const fieldName of hiddenScalarKeys) {
    if (!(fieldName in output)) {
      output[fieldName] = true;
    }
  }

  return output;
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
): OrmDriver<TSchema, PrismaDriverHandle> {
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
      select: args.select ? compilePrismaSelect(schema, modelName, args.select) : undefined,
    });

    return Promise.all(rows.map((row) => projectRow(schema, modelName, row, args.select)));
  }

  async function loadRawOneRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: PrismaWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      select?: SelectShape<TSchema, TModelName>;
    },
  ) {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const delegate = getDelegate(modelName);

    if (delegate.findFirst) {
      return delegate.findFirst({
        where: compileWhere(model, args.where),
        orderBy: compileOrderBy(args.orderBy),
        select: args.select ? compilePrismaSelect(schema, modelName, args.select) : undefined,
      });
    }

    const rows = await delegate.findMany({
      where: compileWhere(model, args.where),
      orderBy: compileOrderBy(args.orderBy),
      take: 1,
      select: args.select ? compilePrismaSelect(schema, modelName, args.select) : undefined,
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
        const relation =
          schema.models[modelName].relations[key as RelationName<TSchema, TModelName>];
        const loadedValue = row[key];
        if (loadedValue !== undefined) {
          const targetModel = relation.target as ModelName<TSchema>;
          const childSelect = value === true ? undefined : value.select;
          output[key] = Array.isArray(loadedValue)
            ? await Promise.all(
                loadedValue.map((item) =>
                  projectRow(schema, targetModel, item as PrismaRow, childSelect as any),
                ),
              )
            : loadedValue === null
              ? relation.kind === "hasMany" || relation.kind === "manyToMany"
                ? []
                : null
              : await projectRow(schema, targetModel, loadedValue as PrismaRow, childSelect as any);
          continue;
        }

        if (relation.kind === "manyToMany") {
          const targetModel = relation.target as ModelName<TSchema>;
          const childSelect = value === true ? undefined : value.select;
          const { throughRelationName, targetRelationName } = prismaManyToManyJoinKeys(relation);
          const throughRows = row[throughRelationName];

          if (Array.isArray(throughRows)) {
            output[key] = await Promise.all(
              throughRows
                .map((entry) =>
                  entry &&
                  typeof entry === "object" &&
                  (entry as PrismaRow)[targetRelationName] &&
                  typeof (entry as PrismaRow)[targetRelationName] === "object"
                    ? ((entry as PrismaRow)[targetRelationName] as PrismaRow)
                    : null,
                )
                .filter((entry): entry is PrismaRow => entry !== null)
                .map((entry) => projectRow(schema, targetModel, entry, childSelect as any)),
            );
            continue;
          }
        }

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

  async function runTransaction<TResult>(
    run: (driver: OrmDriver<TSchema, PrismaDriverHandle>) => Promise<TResult>,
  ) {
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

  const driver: OrmDriver<TSchema, PrismaDriverHandle> = {
    handle: createDriverHandle({
      kind: "prisma",
      client: config.client,
      capabilities: {
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: typeof config.client.$transaction === "function",
        nativeRelationLoading: "partial",
      },
    }),
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
        select: args.select ? compilePrismaSelect(schema, model, args.select) : undefined,
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
          select: args.select ? compilePrismaSelect(schema, model, args.select) : undefined,
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
          select: args.select,
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
        select: args.select ? compilePrismaSelect(schema, model, args.select) : undefined,
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
