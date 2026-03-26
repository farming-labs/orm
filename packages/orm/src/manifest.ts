import type { ScalarKind } from "./fields";
import type { AnyRelation } from "./relations";
import type { AnyModelDefinition, ModelConstraints, SchemaDefinition } from "./schema";

export type ManifestField = {
  name: string;
  column: string;
  kind: ScalarKind;
  nullable: boolean;
  unique: boolean;
  generated?: "id" | "now";
  defaultValue?: unknown;
  references?: string;
  description?: string;
};

export type ManifestConstraint = {
  name: string;
  fields: string[];
  columns: string[];
  unique: boolean;
};

export type ManifestModel = {
  name: string;
  table: string;
  description?: string;
  fields: Record<string, ManifestField>;
  relations: Record<string, AnyRelation>;
  constraints: {
    unique: ManifestConstraint[];
    indexes: ManifestConstraint[];
  };
};

export type SchemaManifest = {
  models: Record<string, ManifestModel>;
};

export type ManifestUniqueLookup = {
  kind: "id" | "field" | "constraint";
  fields: ManifestField[];
  values: Record<string, unknown>;
  constraint?: ManifestConstraint;
};

function isFilterObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
}

function extractEqualityValue(filter: unknown) {
  if (!isFilterObject(filter)) {
    return {
      supported: true,
      value: filter,
    };
  }

  const keys = Object.keys(filter);
  if (keys.length === 1 && "eq" in filter) {
    return {
      supported: true,
      value: filter.eq,
    };
  }

  return {
    supported: false,
    value: undefined,
  };
}

function requireEqualityValues(
  model: ManifestModel,
  where: Record<string, unknown>,
  operation: string,
) {
  const keys = Object.keys(where).filter((key) => key !== "AND" && key !== "OR" && key !== "NOT");

  if ("AND" in where || "OR" in where || "NOT" in where || keys.length === 0) {
    throw new Error(
      `${operation} on model "${model.name}" requires a unique equality filter in "where".`,
    );
  }

  const values: Record<string, unknown> = {};

  for (const fieldName of keys) {
    const field = model.fields[fieldName];
    if (!field) {
      throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
    }

    const { supported, value } = extractEqualityValue(where[fieldName]);
    if (!supported || value === undefined || value === null) {
      throw new Error(
        `${operation} on model "${model.name}" requires the "where" field "${fieldName}" to use a single non-null equality value.`,
      );
    }

    values[fieldName] = value;
  }

  return values;
}

function sameFieldSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((fieldName) => right.includes(fieldName));
}

export function requireUniqueLookup(
  model: ManifestModel,
  where: Record<string, unknown>,
  operation: string,
): ManifestUniqueLookup {
  const values = requireEqualityValues(model, where, operation);
  const keys = Object.keys(values);

  if (keys.length === 1) {
    const field = model.fields[keys[0]!]!;
    if (field.kind === "id") {
      return {
        kind: "id",
        fields: [field],
        values,
      };
    }

    if (field.unique) {
      return {
        kind: "field",
        fields: [field],
        values,
      };
    }
  }

  const constraint = model.constraints.unique.find((candidate) =>
    sameFieldSet([...candidate.fields], keys),
  );

  if (!constraint) {
    throw new Error(
      `${operation} on model "${model.name}" requires the "where" clause to match an id field, unique field, or declared unique constraint using equality values only.`,
    );
  }

  return {
    kind: "constraint",
    fields: constraint.fields.map((fieldName) => model.fields[fieldName]!),
    values: Object.fromEntries(
      constraint.fields.map((fieldName) => [fieldName, values[fieldName]]),
    ),
    constraint,
  };
}

export function resolveRowIdentityLookup(
  model: ManifestModel,
  row: Record<string, unknown>,
): ManifestUniqueLookup {
  const idField = model.fields.id;
  if (idField && row[idField.name] !== undefined && row[idField.name] !== null) {
    return {
      kind: "id",
      fields: [idField],
      values: {
        [idField.name]: row[idField.name],
      },
    };
  }

  const uniqueField = Object.values(model.fields).find(
    (field) => field.unique && row[field.name] !== undefined && row[field.name] !== null,
  );
  if (uniqueField) {
    return {
      kind: "field",
      fields: [uniqueField],
      values: {
        [uniqueField.name]: row[uniqueField.name],
      },
    };
  }

  for (const constraint of model.constraints.unique) {
    if (
      constraint.fields.every(
        (fieldName) => row[fieldName] !== undefined && row[fieldName] !== null,
      )
    ) {
      return {
        kind: "constraint",
        fields: constraint.fields.map((fieldName) => model.fields[fieldName]!),
        values: Object.fromEntries(
          constraint.fields.map((fieldName) => [fieldName, row[fieldName]]),
        ),
        constraint,
      };
    }
  }

  throw new Error(
    `Model "${model.name}" requires an "id" field, unique field, or declared unique constraint with non-null values for identity lookups.`,
  );
}

export function toUniqueLookupWhere(lookup: ManifestUniqueLookup) {
  return Object.fromEntries(lookup.fields.map((field) => [field.name, lookup.values[field.name]]));
}

export function mergeUniqueLookupCreateData(
  model: ManifestModel,
  createData: Partial<Record<string, unknown>>,
  lookup: ManifestUniqueLookup,
  operation: string,
) {
  const output = {
    ...createData,
  };

  for (const field of lookup.fields) {
    const currentValue = output[field.name];
    const expectedValue = lookup.values[field.name];
    if (currentValue !== undefined && currentValue !== expectedValue) {
      throw new Error(
        `${operation} on model "${model.name}" requires create.${field.name} to match where.${field.name}.`,
      );
    }
    output[field.name] = currentValue ?? expectedValue;
  }

  return output;
}

export function validateUniqueLookupUpdateData(
  model: ManifestModel,
  updateData: Partial<Record<string, unknown>>,
  lookup: ManifestUniqueLookup,
  operation: string,
) {
  for (const field of lookup.fields) {
    const nextValue = updateData[field.name];
    if (nextValue !== undefined && nextValue !== lookup.values[field.name]) {
      throw new Error(
        `${operation} on model "${model.name}" cannot change the conflict field "${field.name}".`,
      );
    }
  }
}

function createConstraintName(table: string, columns: string[], suffix: "unique" | "idx") {
  const base = [table, ...columns]
    .join("_")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `${base}_${suffix}`;
}

function normalizeConstraints(
  modelName: string,
  table: string,
  fields: Record<string, ManifestField>,
  constraints: ModelConstraints<any>,
) {
  const normalize = (entries: readonly (readonly string[])[] | undefined, unique: boolean) =>
    (entries ?? []).map((entry) => {
      if (!entry.length) {
        throw new Error(
          `Model "${modelName}" defines an empty ${unique ? "unique" : "index"} constraint.`,
        );
      }

      const columns = entry.map((fieldName) => {
        const field = fields[fieldName];
        if (!field) {
          throw new Error(
            `Model "${modelName}" defines a ${unique ? "unique" : "index"} constraint on unknown field "${fieldName}".`,
          );
        }
        return field.column;
      });

      return {
        name: createConstraintName(table, columns, unique ? "unique" : "idx"),
        fields: [...entry],
        columns,
        unique,
      } satisfies ManifestConstraint;
    });

  return {
    unique: normalize(constraints.unique, true),
    indexes: normalize(constraints.indexes, false),
  };
}

export function createManifest<
  TSchema extends SchemaDefinition<Record<string, AnyModelDefinition>>,
>(schema: TSchema): SchemaManifest {
  const models = Object.fromEntries(
    (Object.entries(schema.models) as Array<[string, AnyModelDefinition]>).map(
      ([name, definition]) => {
        const fields = Object.fromEntries(
          (
            Object.entries(definition.fields) as Array<
              [string, AnyModelDefinition["fields"][string]]
            >
          ).map(([fieldName, field]) => [
            fieldName,
            {
              name: fieldName,
              column: field.config.mappedName ?? fieldName,
              kind: field.config.kind,
              nullable: field.config.nullable,
              unique: field.config.unique,
              generated: field.config.generated,
              defaultValue: field.config.defaultValue,
              references: field.config.references,
              description: field.config.description,
            } satisfies ManifestField,
          ]),
        );

        return [
          name,
          {
            name,
            table: definition.table,
            description: definition.description,
            fields,
            relations: definition.relations,
            constraints: normalizeConstraints(
              name,
              definition.table,
              fields,
              definition.constraints,
            ),
          } satisfies ManifestModel,
        ];
      },
    ),
  );

  return { models };
}
