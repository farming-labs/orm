import type { AnyFieldBuilder, FieldOutput } from "./fields";
import type { AnyRelation, RelationDefinition } from "./relations";

export type FieldMap = Record<string, AnyFieldBuilder>;
export type RelationMap = Record<string, AnyRelation>;

export type ModelDefinition<
  Fields extends FieldMap = FieldMap,
  Relations extends RelationMap = RelationMap,
> = {
  readonly _tag: "model";
  readonly table: string;
  readonly fields: Fields;
  readonly relations: Relations;
  readonly description?: string;
};

export type AnyModelDefinition = ModelDefinition<FieldMap, RelationMap>;

export type SchemaDefinition<
  Models extends Record<string, AnyModelDefinition> = Record<string, AnyModelDefinition>,
> = {
  readonly _tag: "schema";
  readonly models: Models;
};

export function model<Fields extends FieldMap, Relations extends RelationMap = {}>(config: {
  table: string;
  fields: Fields;
  relations?: Relations;
  description?: string;
}): ModelDefinition<Fields, Relations> {
  return {
    _tag: "model",
    table: config.table,
    fields: config.fields,
    relations: (config.relations ?? {}) as Relations,
    description: config.description,
  };
}

export function defineSchema<Models extends Record<string, AnyModelDefinition>>(
  models: Models,
): SchemaDefinition<Models> {
  return {
    _tag: "schema",
    models,
  };
}

export type SchemaModels<TSchema> = TSchema extends SchemaDefinition<infer Models> ? Models : never;

export type ModelName<TSchema> = keyof SchemaModels<TSchema> & string;

export type ModelForName<TSchema, TName extends ModelName<TSchema>> = SchemaModels<TSchema>[TName];

export type ModelFields<TSchema, TName extends ModelName<TSchema>> = ModelForName<
  TSchema,
  TName
>["fields"];

export type ModelRelations<TSchema, TName extends ModelName<TSchema>> = ModelForName<
  TSchema,
  TName
>["relations"];

export type ScalarRecord<TSchema, TName extends ModelName<TSchema>> = {
  [K in keyof ModelFields<TSchema, TName> & string]: FieldOutput<ModelFields<TSchema, TName>[K]>;
};

export type RelationName<TSchema, TName extends ModelName<TSchema>> = keyof ModelRelations<
  TSchema,
  TName
> &
  string;

export type RelationForName<
  TSchema,
  TName extends ModelName<TSchema>,
  TRelationName extends RelationName<TSchema, TName>,
> = ModelRelations<TSchema, TName>[TRelationName];

export type RelationTarget<
  TSchema,
  TName extends ModelName<TSchema>,
  TRelationName extends RelationName<TSchema, TName>,
> =
  RelationForName<TSchema, TName, TRelationName> extends RelationDefinition<infer Target, any>
    ? Extract<Target, ModelName<TSchema>>
    : never;
