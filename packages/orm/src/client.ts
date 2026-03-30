import { normalizeOrmError } from "./errors";
import type { SchemaDefinition } from "./schema";
import type {
  ModelName,
  RelationForName,
  RelationName,
  RelationTarget,
  ScalarRecord,
} from "./schema";

type Direction = "asc" | "desc";

type JsonPrimitive = null | string | number | boolean;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type Comparable = string | number | bigint | Date;

type ValueFilter<T> = T extends string
  ? T | { eq?: T; contains?: string; in?: T[]; not?: T }
  : T extends Comparable
    ? T | { eq?: T; gt?: T; gte?: T; lt?: T; lte?: T; in?: T[]; not?: T }
    : T | { eq?: T; in?: T[]; not?: T };

export type Where<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord]?: ValueFilter<TRecord[K]>;
} & {
  AND?: Array<Where<TRecord>>;
  OR?: Array<Where<TRecord>>;
  NOT?: Where<TRecord>;
};

type RelationQuery<TSchema extends SchemaDefinition<any>, TModelName extends ModelName<TSchema>> = {
  where?: Where<ScalarRecord<TSchema, TModelName>>;
  select?: SelectShape<TSchema, TModelName>;
  orderBy?: Partial<Record<keyof ScalarRecord<TSchema, TModelName> & string, Direction>>;
  take?: number;
  skip?: number;
};

type RelationSelectionValue<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TRelationName extends RelationName<TSchema, TModelName>,
> = true | RelationQuery<TSchema, RelationTarget<TSchema, TModelName, TRelationName>>;

export type SelectShape<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  [K in
    | (keyof ScalarRecord<TSchema, TModelName> & string)
    | RelationName<TSchema, TModelName>]?: K extends RelationName<TSchema, TModelName>
    ? true | RelationQuery<TSchema, any>
    : true;
};

type IsManyRelation<TRelation> = TRelation extends { kind: "hasMany" | "manyToMany" }
  ? true
  : false;

type DefaultSelectedRecord<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = ScalarRecord<TSchema, TModelName>;

type SelectedScalars<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName>,
> = {
  [K in keyof TSelect & keyof ScalarRecord<TSchema, TModelName> as TSelect[K] extends true
    ? K
    : never]: ScalarRecord<TSchema, TModelName>[K];
};

type RelationResult<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TRelationName extends RelationName<TSchema, TModelName>,
  TValue extends RelationSelectionValue<TSchema, TModelName, TRelationName>,
> = TValue extends true
  ? IsManyRelation<RelationForName<TSchema, TModelName, TRelationName>> extends true
    ? Array<DefaultSelectedRecord<TSchema, RelationTarget<TSchema, TModelName, TRelationName>>>
    : DefaultSelectedRecord<TSchema, RelationTarget<TSchema, TModelName, TRelationName>> | null
  : TValue extends RelationQuery<TSchema, infer Target>
    ? Target extends ModelName<TSchema>
      ? IsManyRelation<RelationForName<TSchema, TModelName, TRelationName>> extends true
        ? Array<
            SelectedRecord<
              TSchema,
              Target,
              TValue["select"] extends SelectShape<TSchema, Target> ? TValue["select"] : undefined
            >
          >
        : SelectedRecord<
            TSchema,
            Target,
            TValue["select"] extends SelectShape<TSchema, Target> ? TValue["select"] : undefined
          > | null
      : never
    : never;

type SelectedRelations<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName>,
> = {
  [K in keyof TSelect & RelationName<TSchema, TModelName>]: RelationResult<
    TSchema,
    TModelName,
    K,
    Extract<TSelect[K], RelationSelectionValue<TSchema, TModelName, K>>
  >;
};

export type SelectedRecord<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined,
> =
  TSelect extends SelectShape<TSchema, TModelName>
    ? SelectedScalars<TSchema, TModelName, TSelect> &
        SelectedRelations<TSchema, TModelName, TSelect>
    : DefaultSelectedRecord<TSchema, TModelName>;

export type FindManyArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  where?: Where<ScalarRecord<TSchema, TModelName>>;
  select?: TSelect;
  orderBy?: Partial<Record<keyof ScalarRecord<TSchema, TModelName> & string, Direction>>;
  take?: number;
  skip?: number;
};

export type FindFirstArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = FindManyArgs<TSchema, TModelName, TSelect>;

export type FindOneArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = FindFirstArgs<TSchema, TModelName, TSelect>;

export type FindUniqueArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
  select?: TSelect;
};

export type CreateArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  data: Partial<ScalarRecord<TSchema, TModelName>>;
  select?: TSelect;
};

export type CreateManyArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  data: Array<Partial<ScalarRecord<TSchema, TModelName>>>;
  select?: TSelect;
};

export type UpdateArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
  data: Partial<ScalarRecord<TSchema, TModelName>>;
  select?: TSelect;
};

export type UpdateManyArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
  data: Partial<ScalarRecord<TSchema, TModelName>>;
};

export type DeleteArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
};

export type DeleteManyArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
};

export type CountArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  where?: Where<ScalarRecord<TSchema, TModelName>>;
};

export type UpsertArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
  create: Partial<ScalarRecord<TSchema, TModelName>>;
  update: Partial<ScalarRecord<TSchema, TModelName>>;
  select?: TSelect;
};

export type NativeRelationLoading = "none" | "partial" | "full";
export type NumericIdCapability = "none" | "manual" | "generated";
export type MutationReturningCapabilities = Readonly<{
  create: boolean;
  update: boolean;
  delete: boolean;
}>;
export type MutationReturningMode = "none" | "record";
export type MutationReturningModes = Readonly<{
  create: MutationReturningMode;
  update: MutationReturningMode;
  delete: MutationReturningMode;
}>;

export type UpsertCapability = "none" | "emulated" | "native";
export type TextComparisonBehavior = "database-default" | "case-sensitive" | "case-insensitive";
export type TextMatchingCapabilities = Readonly<{
  equality: TextComparisonBehavior;
  contains: TextComparisonBehavior;
  ordering: TextComparisonBehavior;
}>;
export type NativeRelationCapabilities = Readonly<{
  singularChains: boolean;
  hasMany: boolean;
  manyToMany: boolean;
  filtered: boolean;
  ordered: boolean;
  paginated: boolean;
}>;

export type OrmDriverCapabilities = Readonly<{
  supportsNumericIds: boolean;
  numericIds: NumericIdCapability;
  supportsJSON: boolean;
  supportsDates: boolean;
  supportsBooleans: boolean;
  supportsTransactions: boolean;
  supportsSchemaNamespaces: boolean;
  supportsTransactionalDDL: boolean;
  supportsJoin: boolean;
  nativeRelationLoading: NativeRelationLoading;
  textComparison: TextComparisonBehavior;
  textMatching: TextMatchingCapabilities;
  upsert: UpsertCapability;
  returning: MutationReturningCapabilities;
  returningMode: MutationReturningModes;
  nativeRelations: NativeRelationCapabilities;
}>;

export type OrmDriverCapabilityInput = Partial<
  Omit<OrmDriverCapabilities, "returning" | "returningMode" | "textMatching" | "nativeRelations">
> & {
  returning?: Partial<MutationReturningCapabilities>;
  returningMode?: Partial<MutationReturningModes>;
  textMatching?: Partial<TextMatchingCapabilities>;
  nativeRelations?: Partial<NativeRelationCapabilities>;
};

const defaultMutationReturningCapabilities: MutationReturningCapabilities = Object.freeze({
  create: false,
  update: false,
  delete: false,
});
const defaultMutationReturningModes: MutationReturningModes = Object.freeze({
  create: "none",
  update: "none",
  delete: "none",
});
const defaultTextMatchingCapabilities: TextMatchingCapabilities = Object.freeze({
  equality: "case-sensitive",
  contains: "case-sensitive",
  ordering: "case-sensitive",
});
const defaultNativeRelationCapabilities: NativeRelationCapabilities = Object.freeze({
  singularChains: false,
  hasMany: false,
  manyToMany: false,
  filtered: false,
  ordered: false,
  paginated: false,
});

export const defaultDriverCapabilities: OrmDriverCapabilities = Object.freeze({
  supportsNumericIds: false,
  numericIds: "none",
  supportsJSON: false,
  supportsDates: false,
  supportsBooleans: false,
  supportsTransactions: false,
  supportsSchemaNamespaces: false,
  supportsTransactionalDDL: false,
  supportsJoin: false,
  nativeRelationLoading: "none",
  textComparison: "case-sensitive",
  textMatching: defaultTextMatchingCapabilities,
  upsert: "none",
  returning: defaultMutationReturningCapabilities,
  returningMode: defaultMutationReturningModes,
  nativeRelations: defaultNativeRelationCapabilities,
});

function freezeDriverCapabilities(input?: OrmDriverCapabilityInput): OrmDriverCapabilities {
  const numericIds =
    input?.numericIds ??
    (input?.supportsNumericIds ? "manual" : defaultDriverCapabilities.numericIds);
  const supportsNumericIds = input?.supportsNumericIds ?? numericIds !== "none";
  return Object.freeze({
    ...defaultDriverCapabilities,
    ...input,
    supportsNumericIds,
    numericIds,
    textMatching: Object.freeze({
      ...defaultDriverCapabilities.textMatching,
      ...input?.textMatching,
    }),
    returning: Object.freeze({
      ...defaultDriverCapabilities.returning,
      ...input?.returning,
    }),
    returningMode: Object.freeze({
      ...defaultDriverCapabilities.returningMode,
      ...input?.returningMode,
    }),
    nativeRelations: Object.freeze({
      ...defaultDriverCapabilities.nativeRelations,
      ...input?.nativeRelations,
    }),
  });
}

export type OrmDriverHandle<
  TKind extends string = string,
  TClient = unknown,
  TDialect extends string | undefined = string | undefined,
> = Readonly<{
  kind: TKind;
  client: TClient;
  dialect?: TDialect;
  capabilities: OrmDriverCapabilities;
}>;

export function createDriverHandle<
  TKind extends string,
  TClient,
  TDialect extends string | undefined = string | undefined,
>(input: {
  kind: TKind;
  client: TClient;
  dialect?: TDialect;
  capabilities?: OrmDriverCapabilityInput;
}): OrmDriverHandle<TKind, TClient, TDialect> {
  return Object.freeze({
    kind: input.kind,
    client: input.client,
    dialect: input.dialect,
    capabilities: freezeDriverCapabilities(input.capabilities),
  });
}

export interface OrmDriver<
  TSchema extends SchemaDefinition<any>,
  THandle extends OrmDriverHandle = OrmDriverHandle,
> {
  readonly handle: THandle;
  findMany<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: FindManyArgs<TSchema, TModelName, TSelect>,
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>>;
  findFirst<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: FindFirstArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  findUnique<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: FindUniqueArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  count<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    model: TModelName,
    args?: CountArgs<TSchema, TModelName>,
  ): Promise<number>;
  create<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: CreateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>>;
  createMany<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: CreateManyArgs<TSchema, TModelName, TSelect>,
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>>;
  update<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: UpdateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  updateMany<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    model: TModelName,
    args: UpdateManyArgs<TSchema, TModelName>,
  ): Promise<number>;
  upsert<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: UpsertArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>>;
  delete<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    model: TModelName,
    args: DeleteArgs<TSchema, TModelName>,
  ): Promise<number>;
  deleteMany<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    model: TModelName,
    args: DeleteManyArgs<TSchema, TModelName>,
  ): Promise<number>;
  transaction<TResult>(
    schema: TSchema,
    run: (driver: OrmDriver<TSchema, THandle>) => Promise<TResult>,
  ): Promise<TResult>;
}

export type ModelClient<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  findMany<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args?: FindManyArgs<TSchema, TModelName, TSelect>,
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>>;
  findOne<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args?: FindOneArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  findFirst<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args?: FindFirstArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  findUnique<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: FindUniqueArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  count(args?: CountArgs<TSchema, TModelName>): Promise<number>;
  create<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: CreateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>>;
  createMany<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: CreateManyArgs<TSchema, TModelName, TSelect>,
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>>;
  update<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: UpdateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  updateMany(args: UpdateManyArgs<TSchema, TModelName>): Promise<number>;
  upsert<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: UpsertArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>>;
  delete(args: DeleteArgs<TSchema, TModelName>): Promise<number>;
  deleteMany(args: DeleteManyArgs<TSchema, TModelName>): Promise<number>;
};

export type BatchTask<
  TSchema extends SchemaDefinition<any>,
  TResult,
  THandle extends OrmDriverHandle = OrmDriverHandle,
> = (tx: OrmClient<TSchema, THandle>) => Promise<TResult>;

export type OrmClient<
  TSchema extends SchemaDefinition<any>,
  THandle extends OrmDriverHandle = OrmDriverHandle,
> = {
  [K in ModelName<TSchema>]: ModelClient<TSchema, K>;
} & {
  readonly $driver: THandle;
  transaction<TResult>(
    run: (tx: OrmClient<TSchema, THandle>) => Promise<TResult>,
  ): Promise<TResult>;
  batch<const TResult extends readonly unknown[]>(tasks: {
    [K in keyof TResult]: BatchTask<TSchema, TResult[K], THandle>;
  }): Promise<TResult>;
};

function createModelClient<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
>(
  schema: TSchema,
  driver: OrmDriver<TSchema, any>,
  model: TModelName,
): ModelClient<TSchema, TModelName> {
  const withNormalizedDriverErrors = <TResult>(run: () => Promise<TResult>) =>
    Promise.resolve()
      .then(run)
      .catch((error) => {
        throw normalizeOrmError(driver.handle, error) ?? error;
      });

  return {
    findMany(args) {
      return withNormalizedDriverErrors(
        () => driver.findMany(schema, model, (args ?? {}) as any) as any,
      );
    },
    findOne(args) {
      return withNormalizedDriverErrors(
        () => driver.findFirst(schema, model, (args ?? {}) as any) as any,
      );
    },
    findFirst(args) {
      return withNormalizedDriverErrors(
        () => driver.findFirst(schema, model, (args ?? {}) as any) as any,
      );
    },
    findUnique(args) {
      return withNormalizedDriverErrors(() => driver.findUnique(schema, model, args as any) as any);
    },
    count(args) {
      return withNormalizedDriverErrors(() => driver.count(schema, model, args as any));
    },
    create(args) {
      return withNormalizedDriverErrors(() => driver.create(schema, model, args as any) as any);
    },
    createMany(args) {
      return withNormalizedDriverErrors(() => driver.createMany(schema, model, args as any) as any);
    },
    update(args) {
      return withNormalizedDriverErrors(() => driver.update(schema, model, args as any) as any);
    },
    updateMany(args) {
      return withNormalizedDriverErrors(() => driver.updateMany(schema, model, args as any));
    },
    upsert(args) {
      return withNormalizedDriverErrors(() => driver.upsert(schema, model, args as any) as any);
    },
    delete(args) {
      return withNormalizedDriverErrors(() => driver.delete(schema, model, args as any));
    },
    deleteMany(args) {
      return withNormalizedDriverErrors(() => driver.deleteMany(schema, model, args as any));
    },
  };
}

export function createOrm<
  TSchema extends SchemaDefinition<any>,
  THandle extends OrmDriverHandle = OrmDriverHandle,
>(options: { schema: TSchema; driver: OrmDriver<TSchema, THandle> }): OrmClient<TSchema, THandle> {
  const { schema, driver } = options;
  const models: Record<string, unknown> = {};

  for (const model of Object.keys(schema.models)) {
    models[model] = createModelClient(schema, driver, model as ModelName<TSchema>);
  }

  const orm = models as OrmClient<TSchema, THandle>;
  Object.defineProperty(orm, "$driver", {
    value: driver.handle,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  orm.transaction = (run) =>
    driver
      .transaction(schema, async (txDriver) => {
        const tx = createOrm({
          schema,
          driver: txDriver,
        });
        return run(tx);
      })
      .catch((error) => {
        throw normalizeOrmError(driver.handle, error) ?? error;
      });
  orm.batch = async (tasks) =>
    orm.transaction(async (tx) => {
      const results: unknown[] = [];
      for (const task of tasks) {
        results.push(await task(tx));
      }
      return results as any;
    });
  return orm;
}
