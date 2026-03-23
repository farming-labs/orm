export type ScalarKind = "id" | "string" | "boolean" | "datetime";

export type FieldReference = `${string}.${string}`;

export type FieldConfig<
  Kind extends ScalarKind = ScalarKind,
  Nullable extends boolean = boolean
> = {
  kind: Kind;
  nullable: Nullable;
  unique: boolean;
  defaultValue?: unknown;
  generated?: "id" | "now";
  mappedName?: string;
  references?: FieldReference;
  description?: string;
};

export type AnyFieldBuilder = FieldBuilder<ScalarKind, boolean>;

const cloneField = <
  Kind extends ScalarKind,
  Nullable extends boolean = false
>(
  config: FieldConfig<Kind, Nullable>,
) => new FieldBuilder(config);

export class FieldBuilder<
  Kind extends ScalarKind,
  Nullable extends boolean = false
> {
  readonly _tag = "field";

  constructor(readonly config: FieldConfig<Kind, Nullable>) {}

  unique() {
    return cloneField({
      ...this.config,
      unique: true,
    });
  }

  nullable() {
    return cloneField<Kind, true>({
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

export type ScalarValue<Kind extends ScalarKind> = Kind extends "id"
  ? string
  : Kind extends "string"
    ? string
    : Kind extends "boolean"
      ? boolean
      : Date;

export type FieldOutput<TField> = TField extends FieldBuilder<
  infer Kind,
  infer Nullable
>
  ? Nullable extends true
    ? ScalarValue<Kind> | null
    : ScalarValue<Kind>
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
