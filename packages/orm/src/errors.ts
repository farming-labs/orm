import type { OrmDriverHandle } from "./client";

export type OrmErrorCode =
  | "UNIQUE_CONSTRAINT_VIOLATION"
  | "FOREIGN_KEY_VIOLATION"
  | "MISSING_TABLE"
  | "MISSING_SCHEMA"
  | "TRANSACTION_CONFLICT"
  | "DEADLOCK";

export type OrmErrorMetadata = Readonly<{
  backendKind: string;
  dialect?: string;
  originalCode?: string | number;
  originalMessage?: string;
  retryable: boolean;
  constraint?: string;
  target?: string | string[];
}>;

export class OrmError extends Error {
  readonly code: OrmErrorCode;
  readonly backendKind: string;
  readonly dialect?: string;
  readonly retryable: boolean;
  readonly meta: OrmErrorMetadata;
  override readonly cause?: unknown;

  constructor(input: {
    code: OrmErrorCode;
    message: string;
    backendKind: string;
    dialect?: string;
    retryable?: boolean;
    cause?: unknown;
    meta?: Partial<Omit<OrmErrorMetadata, "backendKind" | "dialect" | "retryable">>;
  }) {
    super(input.message);
    this.name = "OrmError";
    this.code = input.code;
    this.backendKind = input.backendKind;
    this.dialect = input.dialect;
    this.retryable = input.retryable ?? false;
    this.cause = input.cause;
    this.meta = Object.freeze({
      backendKind: input.backendKind,
      dialect: input.dialect,
      retryable: this.retryable,
      ...input.meta,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function getOriginalCode(error: unknown) {
  if (!isRecord(error)) return undefined;
  const code = error.code;
  if (typeof code === "string" || typeof code === "number") {
    return code;
  }
  const errno = error.errno;
  if (typeof errno === "string" || typeof errno === "number") {
    return errno;
  }
  return undefined;
}

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function hasErrorLabel(error: unknown, label: string) {
  if (!isRecord(error) || !Array.isArray(error.errorLabels)) return false;
  return error.errorLabels.includes(label);
}

function createOrmError(
  handle: OrmDriverHandle,
  code: OrmErrorCode,
  error: unknown,
  input?: {
    retryable?: boolean;
    constraint?: string;
    target?: string | string[];
  },
) {
  const runtimeLabel = handle.dialect ? `${handle.kind} (${handle.dialect})` : handle.kind;
  const description = {
    UNIQUE_CONSTRAINT_VIOLATION: "Unique constraint violation",
    FOREIGN_KEY_VIOLATION: "Foreign key violation",
    MISSING_TABLE: "Missing table or collection",
    MISSING_SCHEMA: "Missing schema or database namespace",
    TRANSACTION_CONFLICT: "Transaction conflict",
    DEADLOCK: "Deadlock detected",
  }[code];

  return new OrmError({
    code,
    message: `${description} in ${runtimeLabel} runtime: ${getMessage(error)}`,
    backendKind: handle.kind,
    dialect: handle.dialect,
    retryable: input?.retryable,
    cause: error,
    meta: {
      originalCode: getOriginalCode(error),
      originalMessage: getMessage(error),
      constraint: input?.constraint,
      target: input?.target,
    },
  });
}

function normalizeSqlError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const errno = typeof record.errno === "number" ? record.errno : undefined;
  const message = getMessage(error);

  switch (handle.dialect) {
    case "postgres":
      if (code === "23505") {
        return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, {
          constraint: typeof record.constraint === "string" ? record.constraint : undefined,
        });
      }
      if (code === "23503") {
        return createOrmError(handle, "FOREIGN_KEY_VIOLATION", error, {
          constraint: typeof record.constraint === "string" ? record.constraint : undefined,
        });
      }
      if (code === "42P01" || /relation .+ does not exist/i.test(message)) {
        return createOrmError(handle, "MISSING_TABLE", error);
      }
      if (code === "3F000" || /schema .+ does not exist/i.test(message)) {
        return createOrmError(handle, "MISSING_SCHEMA", error);
      }
      if (code === "40P01") {
        return createOrmError(handle, "DEADLOCK", error, { retryable: true });
      }
      if (code === "40001") {
        return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
      }
      return null;

    case "mysql":
      if (code === "ER_DUP_ENTRY" || errno === 1062) {
        return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error);
      }
      if (
        code === "ER_NO_REFERENCED_ROW_2" ||
        errno === 1452 ||
        code === "ER_ROW_IS_REFERENCED_2" ||
        errno === 1451
      ) {
        return createOrmError(handle, "FOREIGN_KEY_VIOLATION", error);
      }
      if (code === "ER_NO_SUCH_TABLE" || errno === 1146) {
        return createOrmError(handle, "MISSING_TABLE", error);
      }
      if (code === "ER_BAD_DB_ERROR" || errno === 1049) {
        return createOrmError(handle, "MISSING_SCHEMA", error);
      }
      if (code === "ER_LOCK_DEADLOCK" || errno === 1213) {
        return createOrmError(handle, "DEADLOCK", error, { retryable: true });
      }
      if (code === "ER_LOCK_WAIT_TIMEOUT" || errno === 1205) {
        return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
      }
      return null;

    case "sqlite":
      if (
        code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
        /foreign key constraint failed/i.test(message)
      ) {
        return createOrmError(handle, "FOREIGN_KEY_VIOLATION", error);
      }
      if (
        code === "SQLITE_CONSTRAINT_UNIQUE" ||
        code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
        /unique constraint failed/i.test(message)
      ) {
        return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error);
      }
      if (/no such table/i.test(message)) {
        return createOrmError(handle, "MISSING_TABLE", error);
      }
      if (
        code === "SQLITE_BUSY" ||
        code === "SQLITE_LOCKED" ||
        /database is locked/i.test(message)
      ) {
        return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
      }
      return null;

    default:
      return null;
  }
}

function normalizePrismaError(handle: OrmDriverHandle, error: unknown) {
  if (!isRecord(error)) return null;
  const code = typeof error.code === "string" ? error.code : undefined;

  if (code === "P2002") {
    const target = Array.isArray(error.meta)
      ? undefined
      : isRecord(error.meta) && Array.isArray(error.meta.target)
        ? (error.meta.target as string[])
        : undefined;
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, { target });
  }

  if (code === "P2003") {
    const target =
      isRecord(error.meta) && typeof error.meta.field_name === "string"
        ? error.meta.field_name
        : undefined;
    return createOrmError(handle, "FOREIGN_KEY_VIOLATION", error, { target });
  }

  if (code === "P2021") {
    return createOrmError(handle, "MISSING_TABLE", error);
  }

  if (code === "P2034") {
    return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
  }

  return null;
}

function normalizeMongoError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === "number" ? record.code : undefined;
  const codeName = typeof record.codeName === "string" ? record.codeName : undefined;
  const message = getMessage(error);

  if (code === 11000 || /duplicate key error/i.test(message)) {
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error);
  }

  if (code === 26 || /namespace not found|ns not found/i.test(message)) {
    return createOrmError(handle, "MISSING_TABLE", error);
  }

  if (
    code === 112 ||
    codeName === "WriteConflict" ||
    hasErrorLabel(error, "TransientTransactionError") ||
    hasErrorLabel(error, "UnknownTransactionCommitResult")
  ) {
    return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
  }

  return null;
}

function normalizeFirestoreError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code =
    typeof record.code === "number" || typeof record.code === "string" ? record.code : undefined;
  const message = getMessage(error);
  const target =
    Array.isArray(record.target) || typeof record.target === "string"
      ? (record.target as string | string[])
      : undefined;

  if (
    code === 6 ||
    code === "ALREADY_EXISTS" ||
    /already exists|unique constraint/i.test(message)
  ) {
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, { target });
  }

  if (code === 10 || code === "ABORTED") {
    return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
  }

  return null;
}

function normalizeDynamoDbError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code =
    typeof record.code === "number" || typeof record.code === "string" ? record.code : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const message = getMessage(error);
  const target =
    Array.isArray(record.target) || typeof record.target === "string"
      ? (record.target as string | string[])
      : undefined;
  const cancellationReasons = Array.isArray(record.CancellationReasons)
    ? record.CancellationReasons
    : Array.isArray(record.cancellationReasons)
      ? record.cancellationReasons
      : [];
  const hasConditionalCancellation = cancellationReasons.some(
    (reason) =>
      isRecord(reason) &&
      (reason.Code === "ConditionalCheckFailed" || reason.code === "ConditionalCheckFailed"),
  );

  if (
    code === "ConditionalCheckFailedException" ||
    name === "ConditionalCheckFailedException" ||
    hasConditionalCancellation ||
    /unique constraint/i.test(message)
  ) {
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, { target });
  }

  if (code === "ResourceNotFoundException" || name === "ResourceNotFoundException") {
    return createOrmError(handle, "MISSING_TABLE", error);
  }

  if (
    code === "TransactionCanceledException" ||
    name === "TransactionCanceledException" ||
    code === "TransactionConflictException" ||
    name === "TransactionConflictException"
  ) {
    return createOrmError(handle, "TRANSACTION_CONFLICT", error, { retryable: true });
  }

  return null;
}

function normalizeUnstorageError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const message = getMessage(error);
  const target =
    Array.isArray(record.target) || typeof record.target === "string"
      ? (record.target as string | string[])
      : undefined;

  if (
    code === "UNSTORAGE_UNIQUE_CONSTRAINT" ||
    name === "UnstorageUniqueConstraintError" ||
    /unstorage unique constraint violation/i.test(message)
  ) {
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, { target });
  }

  return null;
}

function normalizeRedisError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const message = getMessage(error);
  const target =
    Array.isArray(record.target) || typeof record.target === "string"
      ? (record.target as string | string[])
      : undefined;

  if (
    code === "REDIS_UNIQUE_CONSTRAINT" ||
    name === "RedisUniqueConstraintError" ||
    /redis unique constraint violation/i.test(message)
  ) {
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, { target });
  }

  return null;
}

function normalizeKvError(handle: OrmDriverHandle, error: unknown) {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const message = getMessage(error);
  const target =
    Array.isArray(record.target) || typeof record.target === "string"
      ? (record.target as string | string[])
      : undefined;

  if (
    code === "KV_UNIQUE_CONSTRAINT" ||
    name === "KvUniqueConstraintError" ||
    /cloudflare kv unique constraint violation/i.test(message)
  ) {
    return createOrmError(handle, "UNIQUE_CONSTRAINT_VIOLATION", error, { target });
  }

  return null;
}

export function isOrmError(error: unknown): error is OrmError {
  return error instanceof OrmError;
}

export function normalizeOrmError(handle: OrmDriverHandle, error: unknown) {
  if (isOrmError(error)) {
    return error;
  }

  switch (handle.kind) {
    case "sql":
    case "drizzle":
    case "kysely":
    case "edgedb":
      return normalizeSqlError(handle, error);
    case "prisma":
      return normalizePrismaError(handle, error);
    case "mongo":
    case "mongoose":
      return normalizeMongoError(handle, error);
    case "firestore":
      return normalizeFirestoreError(handle, error);
    case "dynamodb":
      return normalizeDynamoDbError(handle, error);
    case "kv":
      return normalizeKvError(handle, error);
    case "redis":
      return normalizeRedisError(handle, error);
    case "unstorage":
      return normalizeUnstorageError(handle, error);
    default:
      return null;
  }
}
