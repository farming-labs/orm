import { createOrm } from "@farming-labs/orm";
import type {
  MongooseExecLike,
  MongooseModelLike,
  MongooseQueryLike,
  MongooseSessionLike,
} from "../../src";
import { createMongooseDriver } from "../../src";
import { schema, type RuntimeOrm } from "./auth";

type StoredState = Record<string, Array<Record<string, unknown>>>;

function compareValues(left: unknown, right: unknown) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(String(left)).getTime() - new Date(String(right)).getTime();
  }
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  const entries = Object.entries(filter);
  if (!entries.length) return true;

  return entries.every(([key, value]) => {
    if (key === "$and") {
      return (value as Array<Record<string, unknown>>).every((item) => matchesFilter(doc, item));
    }
    if (key === "$or") {
      return (value as Array<Record<string, unknown>>).some((item) => matchesFilter(doc, item));
    }
    if (key === "$nor") {
      return !(value as Array<Record<string, unknown>>).some((item) => matchesFilter(doc, item));
    }

    const current = doc[key];
    if (!value || typeof value !== "object" || value instanceof Date || Array.isArray(value)) {
      return Object.is(current, value);
    }

    return Object.entries(value).every(([operator, operand]) => {
      if (operator === "$eq") return Object.is(current, operand);
      if (operator === "$ne") return !Object.is(current, operand);
      if (operator === "$in") {
        return Array.isArray(operand) && operand.some((item) => Object.is(item, current));
      }
      if (operator === "$regex") {
        return current != null && (operand as RegExp).test(String(current));
      }
      if (operator === "$gt") return compareValues(current, operand) > 0;
      if (operator === "$gte") return compareValues(current, operand) >= 0;
      if (operator === "$lt") return compareValues(current, operand) < 0;
      if (operator === "$lte") return compareValues(current, operand) <= 0;
      return false;
    });
  });
}

class FakeExec<TResult> implements MongooseExecLike<TResult> {
  private currentSession?: FakeSession;

  constructor(private readonly run: (session?: FakeSession) => TResult | Promise<TResult>) {}

  session(session: MongooseSessionLike) {
    this.currentSession = session as FakeSession;
    return this;
  }

  async exec() {
    return this.run(this.currentSession);
  }
}

class FakeQuery<TResult> implements MongooseQueryLike<TResult> {
  private currentSession?: FakeSession;
  private sortOrder?: Record<string, 1 | -1>;
  private skipValue?: number;
  private limitValue?: number;

  constructor(
    private readonly run: (input: {
      session?: FakeSession;
      sortOrder?: Record<string, 1 | -1>;
      skip?: number;
      limit?: number;
    }) => TResult | Promise<TResult>,
  ) {}

  sort(sort: Record<string, 1 | -1>) {
    this.sortOrder = sort;
    return this;
  }

  skip(value: number) {
    this.skipValue = value;
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  session(session: MongooseSessionLike) {
    this.currentSession = session as FakeSession;
    return this;
  }

  lean() {
    return this;
  }

  async exec() {
    return this.run({
      session: this.currentSession,
      sortOrder: this.sortOrder,
      skip: this.skipValue,
      limit: this.limitValue,
    });
  }
}

class FakeSession implements MongooseSessionLike {
  state: StoredState;

  constructor(
    private readonly manager: FakeSessionManager,
    snapshot: StoredState,
  ) {
    this.state = structuredClone(snapshot);
  }

  async withTransaction<TResult>(run: () => Promise<TResult>) {
    const result = await run();
    this.manager.state = structuredClone(this.state);
    return result;
  }

  endSession() {}
}

class FakeSessionManager {
  constructor(public state: StoredState) {}

  async startSession() {
    return new FakeSession(this, this.state);
  }
}

class FakeModel implements MongooseModelLike {
  constructor(
    private readonly manager: FakeSessionManager,
    private readonly collectionName: string,
  ) {}

  private getCollection(session?: FakeSession) {
    const state = session?.state ?? this.manager.state;
    state[this.collectionName] ??= [];
    return state[this.collectionName]!;
  }

  find(filter: Record<string, unknown>) {
    return new FakeQuery<Record<string, unknown>[]>(({ session, sortOrder, skip, limit }) => {
      let rows = this.getCollection(session)
        .filter((doc) => matchesFilter(doc, filter))
        .map((doc) => structuredClone(doc));

      if (sortOrder) {
        const orderEntries = Object.entries(sortOrder);
        rows.sort((left, right) => {
          for (const [key, direction] of orderEntries) {
            const result = compareValues(left[key], right[key]);
            if (result !== 0) {
              return direction === -1 ? -result : result;
            }
          }
          return 0;
        });
      }

      if (skip !== undefined) rows = rows.slice(skip);
      if (limit !== undefined) rows = rows.slice(0, limit);
      return rows;
    });
  }

  findOne(filter: Record<string, unknown>) {
    return new FakeQuery<Record<string, unknown> | null>(({ session }) => {
      const row = this.getCollection(session).find((doc) => matchesFilter(doc, filter));
      return row ? structuredClone(row) : null;
    });
  }

  countDocuments(filter: Record<string, unknown>) {
    return new FakeExec<number>((session) =>
      this.getCollection(session).filter((doc) => matchesFilter(doc, filter)).length,
    );
  }

  async create(doc: Record<string, unknown>, options?: { session?: MongooseSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const created = structuredClone(doc);
    collection.push(created);
    return structuredClone(created);
  }

  async insertMany(docs: Record<string, unknown>[], options?: { session?: MongooseSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const created = docs.map((doc) => structuredClone(doc));
    collection.push(...created);
    return structuredClone(created);
  }

  updateMany(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
    options?: { session?: MongooseSessionLike },
  ) {
    return new FakeExec<{ modifiedCount?: number; matchedCount?: number }>((sessionArg) => {
      const session = (options?.session as FakeSession | undefined) ?? sessionArg;
      const collection = this.getCollection(session);
      let matchedCount = 0;
      for (const row of collection) {
        if (!matchesFilter(row, filter)) continue;
        matchedCount += 1;
        Object.assign(row, structuredClone(update.$set));
      }
      return {
        matchedCount,
        modifiedCount: matchedCount,
      };
    });
  }

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
    options?: {
      upsert?: boolean;
      new?: boolean;
      returnDocument?: "after" | "before";
      session?: MongooseSessionLike;
    },
  ) {
    return new FakeQuery<Record<string, unknown> | null>(({ session }) => {
      const activeSession = (options?.session as FakeSession | undefined) ?? session;
      const collection = this.getCollection(activeSession);
      const index = collection.findIndex((doc) => matchesFilter(doc, filter));
      const setKeys = new Set(Object.keys(update.$set ?? {}));
      const setOnInsertKeys = Object.keys(update.$setOnInsert ?? {});

      for (const key of setOnInsertKeys) {
        if (setKeys.has(key)) {
          throw new Error(`Conflicting upsert path "${key}" was sent to both $set and $setOnInsert.`);
        }
      }

      if (index >= 0) {
        const current = collection[index]!;
        Object.assign(current, structuredClone(update.$set ?? {}));
        return structuredClone(current);
      }

      if (!options?.upsert) {
        return null;
      }

      const created = {
        ...(structuredClone(update.$setOnInsert ?? {}) as Record<string, unknown>),
        ...(structuredClone(update.$set ?? {}) as Record<string, unknown>),
      };
      collection.push(created);
      return structuredClone(created);
    });
  }

  findOneAndDelete(filter: Record<string, unknown>, options?: { session?: MongooseSessionLike }) {
    return new FakeQuery<Record<string, unknown> | null>(({ session }) => {
      const activeSession = (options?.session as FakeSession | undefined) ?? session;
      const collection = this.getCollection(activeSession);
      const index = collection.findIndex((doc) => matchesFilter(doc, filter));
      if (index === -1) return null;
      const [deleted] = collection.splice(index, 1);
      return deleted ? structuredClone(deleted) : null;
    });
  }

  deleteMany(filter: Record<string, unknown>, options?: { session?: MongooseSessionLike }) {
    return new FakeExec<{ deletedCount?: number }>((sessionArg) => {
      const session = (options?.session as FakeSession | undefined) ?? sessionArg;
      const collection = this.getCollection(session);
      const before = collection.length;
      const remaining = collection.filter((doc) => !matchesFilter(doc, filter));
      collection.splice(0, collection.length, ...remaining);
      return {
        deletedCount: before - remaining.length,
      };
    });
  }
}

export function createTestManager() {
  return new FakeSessionManager({
    users: [],
    profiles: [],
    sessions: [],
    organizations: [],
    members: [],
  });
}

export function createTestRuntime() {
  const manager = createTestManager();

  const orm = createOrm({
    schema,
    driver: createMongooseDriver<typeof schema>({
      models: createTestModels(manager),
      startSession: () => manager.startSession(),
    }),
  });

  return { orm: orm as RuntimeOrm, manager };
}

export function createTestModels(manager: FakeSessionManager) {
  return {
    user: new FakeModel(manager, "users"),
    profile: new FakeModel(manager, "profiles"),
    session: new FakeModel(manager, "sessions"),
    organization: new FakeModel(manager, "organizations"),
    member: new FakeModel(manager, "members"),
  };
}
