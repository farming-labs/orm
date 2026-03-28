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

export type GeneratedKind = "id" | "now" | "increment";
export type IdValueType = "string" | "integer";
export type IdOptions =
  | {
      type?: "string";
      generated?: "id";
    }
  | {
      type: "integer";
      generated?: "increment";
    };

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
  generated?: GeneratedKind;
  mappedName?: string;
  references?: FieldReference;
  description?: string;
  enumValues?: readonly string[];
  idType?: IdValueType;
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
    return cloneField<Kind, Nullable, Value>({
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

  default(value: Nullable extends true ? Value | null : Value) {
    return cloneField<Kind, Nullable, Value>({
      ...this.config,
      defaultValue: value,
    });
  }

  defaultNow() {
    return cloneField<Kind, Nullable, Value>({
      ...this.config,
      generated: "now",
    });
  }

  references(reference: FieldReference) {
    return cloneField<Kind, Nullable, Value>({
      ...this.config,
      references: reference,
    });
  }

  map(name: string) {
    return cloneField<Kind, Nullable, Value>({
      ...this.config,
      mappedName: name,
    });
  }

  describe(description: string) {
    return cloneField<Kind, Nullable, Value>({
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

export function id(): FieldBuilder<"id", false, string>;
export function id(options: { type?: "string" }): FieldBuilder<"id", false, string>;
export function id(options: { type: "integer" }): FieldBuilder<"id", false, number>;
export function id(options: {
  type: "integer";
  generated: "increment";
}): FieldBuilder<"id", false, number>;
export function id(options?: IdOptions) {
  if (options?.type === "integer") {
    return new FieldBuilder<"id", false, number>({
      kind: "id",
      nullable: false,
      unique: true,
      generated: options.generated,
      idType: "integer",
    });
  }

  return new FieldBuilder<"id", false, string>({
    kind: "id",
    nullable: false,
    unique: true,
    generated: "id",
    idType: "string",
  });
}

export function numericId(): FieldBuilder<"id", false, number>;
export function numericId(options: { generated: "increment" }): FieldBuilder<"id", false, number>;
export function numericId(options?: { generated?: "increment" }) {
  return new FieldBuilder<"id", false, number>({
    kind: "id",
    nullable: false,
    unique: true,
    generated: options?.generated,
    idType: "integer",
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
