import type { SchemaDefinition } from "./schema";
import type {
  ModelName,
  RelationForName,
  RelationName,
  RelationTarget,
  ScalarRecord,
} from "./schema";

type Direction = "asc" | "desc";

type Primitive = string | number | boolean | Date | null;

type Comparable = string | number | Date;

type ValueFilter<T> = T extends string
  ? T | { eq?: T; contains?: string; in?: T[]; not?: T }
  : T extends Comparable
    ? T | { eq?: T; gt?: T; gte?: T; lt?: T; lte?: T; in?: T[]; not?: T }
    : T | { eq?: T; in?: T[]; not?: T };

export type Where<TRecord extends Record<string, Primitive>> = {
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

export type CreateArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
  TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
> = {
  data: Partial<ScalarRecord<TSchema, TModelName>>;
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

export type DeleteArgs<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  where: Where<ScalarRecord<TSchema, TModelName>>;
};

export interface OrmDriver<TSchema extends SchemaDefinition<any>> {
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
  create<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: CreateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>>;
  update<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined,
  >(
    schema: TSchema,
    model: TModelName,
    args: UpdateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  delete<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    model: TModelName,
    args: DeleteArgs<TSchema, TModelName>,
  ): Promise<number>;
  transaction<TResult>(
    schema: TSchema,
    run: (driver: OrmDriver<TSchema>) => Promise<TResult>,
  ): Promise<TResult>;
}

export type ModelClient<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
> = {
  findMany<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args?: FindManyArgs<TSchema, TModelName, TSelect>,
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>>;
  findFirst<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args?: FindFirstArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  create<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: CreateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>>;
  update<TSelect extends SelectShape<TSchema, TModelName> | undefined = undefined>(
    args: UpdateArgs<TSchema, TModelName, TSelect>,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect> | null>;
  delete(args: DeleteArgs<TSchema, TModelName>): Promise<number>;
};

export type OrmClient<TSchema extends SchemaDefinition<any>> = {
  [K in ModelName<TSchema>]: ModelClient<TSchema, K>;
} & {
  transaction<TResult>(run: (tx: OrmClient<TSchema>) => Promise<TResult>): Promise<TResult>;
};

function createModelClient<
  TSchema extends SchemaDefinition<any>,
  TModelName extends ModelName<TSchema>,
>(
  schema: TSchema,
  driver: OrmDriver<TSchema>,
  model: TModelName,
): ModelClient<TSchema, TModelName> {
  return {
    findMany(args) {
      return driver.findMany(schema, model, (args ?? {}) as any) as any;
    },
    findFirst(args) {
      return driver.findFirst(schema, model, (args ?? {}) as any) as any;
    },
    create(args) {
      return driver.create(schema, model, args as any) as any;
    },
    update(args) {
      return driver.update(schema, model, args as any) as any;
    },
    delete(args) {
      return driver.delete(schema, model, args as any) as any;
    },
  };
}

export function createOrm<TSchema extends SchemaDefinition<any>>(options: {
  schema: TSchema;
  driver: OrmDriver<TSchema>;
}): OrmClient<TSchema> {
  const { schema, driver } = options;
  const models: Record<string, unknown> = {};

  for (const model of Object.keys(schema.models)) {
    models[model] = createModelClient(schema, driver, model as ModelName<TSchema>);
  }

  const orm = models as OrmClient<TSchema>;
  orm.transaction = (run) =>
    driver.transaction(schema, async (txDriver) => {
      const tx = createOrm({
        schema,
        driver: txDriver,
      });
      return run(tx);
    });
  return orm;
}
