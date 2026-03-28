export type ScalarKind =
  | "id"
  | "string"
  | "boolean"
  | "datetime"
  | "integer"
  | "json"
  | "enum"
  | "bigint"
  | "decimal";

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | { [key: string]: JsonValue }
  | JsonValue[];

export type FieldReference = `${string}.${string}`;

export type FieldConfig<
  Kind extends ScalarKind = ScalarKind,
  Nullable extends boolean = boolean,
> = {
  kind: Kind;
  nullable: Nullable;
  unique: boolean;
  defaultValue?: unknown;
  generated?: "id" | "now";
  mappedName?: string;
  references?: FieldReference;
  description?: string;
  enumValues?: readonly string[];
};

export type ScalarValue<Kind extends ScalarKind> = Kind extends "id"
  ? string
  : Kind extends "string"
    ? string
    : Kind extends "boolean"
      ? boolean
      : Kind extends "datetime"
        ? Date
        : Kind extends "integer"
          ? number
          : Kind extends "json"
            ? JsonValue
            : Kind extends "enum"
              ? string
              : Kind extends "bigint"
                ? bigint
                : string;

export type AnyFieldBuilder = FieldBuilder<ScalarKind, boolean, ScalarValue<ScalarKind>>;

const cloneField = <
  Kind extends ScalarKind,
  Nullable extends boolean = false,
  Value = ScalarValue<Kind>,
>(
  config: FieldConfig<Kind, Nullable>,
) => new FieldBuilder<Kind, Nullable, Value>(config);

export class FieldBuilder<
  Kind extends ScalarKind,
  Nullable extends boolean = false,
  Value = ScalarValue<Kind>,
> {
  readonly _tag = "field";
  readonly __kind?: Kind;
  readonly __nullable?: Nullable;
  readonly __value?: Value;

  constructor(readonly config: FieldConfig<Kind, Nullable>) {}

  unique() {
    return cloneField({
      ...this.config,
      unique: true,
    });
  }

  nullable() {
    return cloneField<Kind, true, Value>({
      ...this.config,
      nullable: true,
    });
  }

  default(value: unknown) {
    return cloneField({
      ...this.config,
      defaultValue: value,
    });
  }

  defaultNow() {
    return cloneField({
      ...this.config,
      generated: "now",
    });
  }

  references(reference: FieldReference) {
    return cloneField({
      ...this.config,
      references: reference,
    });
  }

  map(name: string) {
    return cloneField({
      ...this.config,
      mappedName: name,
    });
  }

  describe(description: string) {
    return cloneField({
      ...this.config,
      description,
    });
  }
}

export type FieldOutput<TField> = TField extends {
  __nullable?: infer Nullable;
  __value?: infer Value;
}
  ? Nullable extends true
    ? Value | null
    : Value
  : never;

export function id() {
  return new FieldBuilder({
    kind: "id",
    nullable: false,
    unique: true,
    generated: "id",
  });
}

export function string() {
  return new FieldBuilder({
    kind: "string",
    nullable: false,
    unique: false,
  });
}

function normalizeEnumerationValues<TValues extends readonly [string, ...string[]]>(
  values: TValues,
) {
  const normalized = values.map((value) => {
    if (!value.length) {
      throw new Error("enumeration() values must be non-empty strings.");
    }

    return value;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new Error("enumeration() values must be unique.");
  }

  return normalized;
}

export function enumeration<const TValues extends readonly [string, ...string[]]>(values: TValues) {
  return new FieldBuilder<"enum", false, TValues[number]>({
    kind: "enum",
    nullable: false,
    unique: false,
    enumValues: normalizeEnumerationValues(values),
  });
}

export function boolean() {
  return new FieldBuilder({
    kind: "boolean",
    nullable: false,
    unique: false,
  });
}

export function datetime() {
  return new FieldBuilder({
    kind: "datetime",
    nullable: false,
    unique: false,
  });
}

export function integer() {
  return new FieldBuilder({
    kind: "integer",
    nullable: false,
    unique: false,
  });
}

export function bigint() {
  return new FieldBuilder<"bigint", false, bigint>({
    kind: "bigint",
    nullable: false,
    unique: false,
  });
}

export function decimal() {
  return new FieldBuilder<"decimal", false, string>({
    kind: "decimal",
    nullable: false,
    unique: false,
  });
}

export function json<TValue extends JsonValue = JsonValue>() {
  return new FieldBuilder<"json", false, TValue>({
    kind: "json",
    nullable: false,
    unique: false,
  });
}
