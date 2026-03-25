import { createOrm } from "@farming-labs/orm";
import type {
  MongoCollectionLike,
  MongoCursorLike,
  MongoSessionLike,
} from "../../src";
import { createMongoDriver } from "../../src";
import { schema, type RuntimeOrm } from "../../../mongoose/test/support/auth";

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

class FakeCursor implements MongoCursorLike<Record<string, unknown>> {
  private sortOrder?: Record<string, 1 | -1>;
  private skipValue?: number;
  private limitValue?: number;

  constructor(private readonly load: () => Array<Record<string, unknown>>) {}

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

  async toArray() {
    let rows = this.load().map((row) => structuredClone(row));

    if (this.sortOrder) {
      const orderEntries = Object.entries(this.sortOrder);
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

    if (this.skipValue !== undefined) rows = rows.slice(this.skipValue);
    if (this.limitValue !== undefined) rows = rows.slice(0, this.limitValue);
    return rows;
  }
}

class FakeSession implements MongoSessionLike {
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

class FakeCollection implements MongoCollectionLike {
  collectionName?: string;

  constructor(
    private readonly manager: FakeSessionManager,
    collectionName: string,
  ) {
    this.collectionName = collectionName;
  }

  private getCollection(session?: FakeSession) {
    const state = session?.state ?? this.manager.state;
    state[this.collectionName!] ??= [];
    return state[this.collectionName!]!;
  }

  find(filter: Record<string, unknown>, options?: { session?: MongoSessionLike }) {
    return new FakeCursor(() =>
      this.getCollection(options?.session as FakeSession | undefined).filter((doc) =>
        matchesFilter(doc, filter),
      ),
    );
  }

  async findOne(filter: Record<string, unknown>, options?: { session?: MongoSessionLike }) {
    const row = this.getCollection(options?.session as FakeSession | undefined).find((doc) =>
      matchesFilter(doc, filter),
    );
    return row ? structuredClone(row) : null;
  }

  async countDocuments(filter: Record<string, unknown>, options?: { session?: MongoSessionLike }) {
    return this.getCollection(options?.session as FakeSession | undefined).filter((doc) =>
      matchesFilter(doc, filter),
    ).length;
  }

  async insertOne(doc: Record<string, unknown>, options?: { session?: MongoSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const created = structuredClone(doc);
    collection.push(created);
    return {
      insertedId: created._id ?? created.id,
    };
  }

  async insertMany(docs: Record<string, unknown>[], options?: { session?: MongoSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const created = docs.map((doc) => structuredClone(doc));
    collection.push(...created);
    return {
      insertedIds: Object.fromEntries(created.map((doc, index) => [index, doc._id ?? doc.id])),
    };
  }

  async updateMany(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
    options?: { session?: MongoSessionLike },
  ) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
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
  }

  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
    options?: {
      upsert?: boolean;
      returnDocument?: "after" | "before";
      session?: MongoSessionLike;
    },
  ) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
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
      const before = structuredClone(current);
      Object.assign(current, structuredClone(update.$set ?? {}));
      return options?.returnDocument === "before" ? before : structuredClone(current);
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
  }

  async findOneAndDelete(
    filter: Record<string, unknown>,
    options?: { session?: MongoSessionLike },
  ) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const index = collection.findIndex((doc) => matchesFilter(doc, filter));
    if (index === -1) return null;
    const [deleted] = collection.splice(index, 1);
    return deleted ? structuredClone(deleted) : null;
  }

  async deleteMany(filter: Record<string, unknown>, options?: { session?: MongoSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const before = collection.length;
    const remaining = collection.filter((doc) => !matchesFilter(doc, filter));
    collection.splice(0, collection.length, ...remaining);
    return {
      deletedCount: before - remaining.length,
    };
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

export function createTestCollections(manager: FakeSessionManager) {
  return {
    user: new FakeCollection(manager, "users"),
    profile: new FakeCollection(manager, "profiles"),
    session: new FakeCollection(manager, "sessions"),
    organization: new FakeCollection(manager, "organizations"),
    member: new FakeCollection(manager, "members"),
  };
}

export function createTestRuntime() {
  const manager = createTestManager();

  const orm = createOrm({
    schema,
    driver: createMongoDriver<typeof schema>({
      collections: createTestCollections(manager),
      startSession: () => manager.startSession(),
    }),
  });

  return { orm: orm as RuntimeOrm, manager };
}
