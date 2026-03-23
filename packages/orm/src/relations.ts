export type RelationKind = "belongsTo" | "hasOne" | "hasMany" | "manyToMany";

export type RelationDefinition<
  Target extends string = string,
  Kind extends RelationKind = RelationKind,
> = Kind extends "manyToMany"
  ? {
      kind: Kind;
      target: Target;
      through: string;
      from: string;
      to: string;
    }
  : {
      kind: Kind;
      target: Target;
      foreignKey: string;
    };

export type AnyRelation = RelationDefinition<string, RelationKind>;

export function belongsTo<Target extends string>(target: Target, config: { foreignKey: string }) {
  return {
    kind: "belongsTo",
    target,
    foreignKey: config.foreignKey,
  } satisfies RelationDefinition<Target, "belongsTo">;
}

export function hasOne<Target extends string>(target: Target, config: { foreignKey: string }) {
  return {
    kind: "hasOne",
    target,
    foreignKey: config.foreignKey,
  } satisfies RelationDefinition<Target, "hasOne">;
}

export function hasMany<Target extends string>(target: Target, config: { foreignKey: string }) {
  return {
    kind: "hasMany",
    target,
    foreignKey: config.foreignKey,
  } satisfies RelationDefinition<Target, "hasMany">;
}

export function manyToMany<Target extends string>(
  target: Target,
  config: {
    through: string;
    from: string;
    to: string;
  },
) {
  return {
    kind: "manyToMany",
    target,
    through: config.through,
    from: config.from,
    to: config.to,
  } satisfies RelationDefinition<Target, "manyToMany">;
}
