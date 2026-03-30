import { randomUUID } from "node:crypto";
import type {
  FirestoreCollectionLike,
  FirestoreDbLike,
  FirestoreDocumentReferenceLike,
  FirestoreDocumentSnapshotLike,
  FirestoreQuerySnapshotLike,
  FirestoreTransactionLike,
} from "../../src";

type StoredCollections = Map<string, Map<string, Record<string, unknown>>>;

function cloneCollections(source: StoredCollections): StoredCollections {
  return new Map(
    [...source.entries()].map(([collection, documents]) => [
      collection,
      new Map([...documents.entries()].map(([id, data]) => [id, structuredClone(data)])),
    ]),
  );
}

function getCollectionStore(state: StoredCollections, name: string) {
  let collection = state.get(name);
  if (!collection) {
    collection = new Map<string, Record<string, unknown>>();
    state.set(name, collection);
  }
  return collection;
}

class InMemoryDocumentSnapshot implements FirestoreDocumentSnapshotLike {
  constructor(
    readonly id: string,
    readonly ref: FirestoreDocumentReferenceLike,
    private readonly payload: Record<string, unknown> | undefined,
  ) {}

  get exists() {
    return this.payload !== undefined;
  }

  data() {
    return this.payload ? structuredClone(this.payload) : undefined;
  }
}

class InMemoryQuerySnapshot implements FirestoreQuerySnapshotLike {
  constructor(readonly docs: FirestoreDocumentSnapshotLike[]) {}
}

class InMemoryDocumentReference implements FirestoreDocumentReferenceLike {
  constructor(
    private readonly root: InMemoryFirestore,
    private readonly collectionName: string,
    readonly id: string,
  ) {}

  async get() {
    return this.root.readDocument(this.collectionName, this.id, this);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
    this.root.writeDocument(this.collectionName, this.id, data, options);
  }

  async update(data: Partial<Record<string, unknown>>) {
    this.root.updateDocument(this.collectionName, this.id, data);
  }

  async delete() {
    this.root.deleteDocument(this.collectionName, this.id);
  }
}

class InMemoryCollection implements FirestoreCollectionLike {
  constructor(
    private readonly root: InMemoryFirestore,
    readonly id: string,
  ) {}

  doc(id = randomUUID()) {
    return new InMemoryDocumentReference(this.root, this.id, id);
  }

  async get() {
    return this.root.readCollection(this.id);
  }
}

class InMemoryTransaction implements FirestoreTransactionLike {
  constructor(
    private readonly root: InMemoryFirestore,
    private readonly state: StoredCollections,
  ) {}

  async get(target: FirestoreCollectionLike | FirestoreDocumentReferenceLike) {
    if ("doc" in target) {
      return this.root.readCollection(target.id ?? "", this.state);
    }

    return this.root.readDocumentFromReference(target, this.state);
  }

  set(
    reference: FirestoreDocumentReferenceLike,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ) {
    this.root.writeDocumentFromReference(reference, data, options, this.state);
  }

  update(reference: FirestoreDocumentReferenceLike, data: Partial<Record<string, unknown>>) {
    this.root.updateDocumentFromReference(reference, data, this.state);
  }

  delete(reference: FirestoreDocumentReferenceLike) {
    this.root.deleteDocumentFromReference(reference, this.state);
  }
}

export class InMemoryFirestore implements FirestoreDbLike {
  private readonly collections: StoredCollections = new Map();

  collection(name: string) {
    return new InMemoryCollection(this, name);
  }

  async getAll(...references: FirestoreDocumentReferenceLike[]) {
    return Promise.all(references.map((reference) => this.readDocumentFromReference(reference)));
  }

  batch() {
    return {};
  }

  async runTransaction<TResult>(
    updateFunction: (transaction: FirestoreTransactionLike) => Promise<TResult>,
  ) {
    const staged = cloneCollections(this.collections);
    const transaction = new InMemoryTransaction(this, staged);
    const result = await updateFunction(transaction);
    this.collections.clear();
    for (const [collection, documents] of staged.entries()) {
      this.collections.set(collection, documents);
    }
    return result;
  }

  seed(collection: string, id: string, data: Record<string, unknown>) {
    getCollectionStore(this.collections, collection).set(id, structuredClone(data));
  }

  private asReference(reference: FirestoreDocumentReferenceLike) {
    if (!(reference instanceof InMemoryDocumentReference)) {
      throw new Error("Unsupported test document reference.");
    }

    return reference;
  }

  readDocument(
    collectionName: string,
    id: string,
    reference?: FirestoreDocumentReferenceLike,
    state = this.collections,
  ) {
    const payload = getCollectionStore(state, collectionName).get(id);
    return new InMemoryDocumentSnapshot(
      id,
      reference ?? new InMemoryDocumentReference(this, collectionName, id),
      payload ? structuredClone(payload) : undefined,
    );
  }

  readDocumentFromReference(reference: FirestoreDocumentReferenceLike, state = this.collections) {
    const resolved = this.asReference(reference);
    return this.readDocument(
      resolved["collectionName" as keyof InMemoryDocumentReference] as string,
      resolved.id,
      reference,
      state,
    );
  }

  readCollection(collectionName: string, state = this.collections) {
    const collection = getCollectionStore(state, collectionName);
    return new InMemoryQuerySnapshot(
      [...collection.entries()].map(
        ([id, data]) =>
          new InMemoryDocumentSnapshot(
            id,
            new InMemoryDocumentReference(this, collectionName, id),
            structuredClone(data),
          ),
      ),
    );
  }

  writeDocument(
    collectionName: string,
    id: string,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
    state = this.collections,
  ) {
    const collection = getCollectionStore(state, collectionName);
    const current = collection.get(id) ?? {};
    collection.set(
      id,
      options?.merge
        ? { ...structuredClone(current), ...structuredClone(data) }
        : structuredClone(data),
    );
  }

  writeDocumentFromReference(
    reference: FirestoreDocumentReferenceLike,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
    state = this.collections,
  ) {
    const resolved = this.asReference(reference);
    this.writeDocument(
      resolved["collectionName" as keyof InMemoryDocumentReference] as string,
      resolved.id,
      data,
      options,
      state,
    );
  }

  updateDocument(
    collectionName: string,
    id: string,
    data: Partial<Record<string, unknown>>,
    state = this.collections,
  ) {
    const collection = getCollectionStore(state, collectionName);
    const current = collection.get(id);
    if (!current) {
      const error = new Error(`No document found for ${collectionName}/${id}.`);
      Object.assign(error, { code: 5 });
      throw error;
    }
    collection.set(id, {
      ...structuredClone(current),
      ...structuredClone(data),
    });
  }

  updateDocumentFromReference(
    reference: FirestoreDocumentReferenceLike,
    data: Partial<Record<string, unknown>>,
    state = this.collections,
  ) {
    const resolved = this.asReference(reference);
    this.updateDocument(
      resolved["collectionName" as keyof InMemoryDocumentReference] as string,
      resolved.id,
      data,
      state,
    );
  }

  deleteDocument(collectionName: string, id: string, state = this.collections) {
    getCollectionStore(state, collectionName).delete(id);
  }

  deleteDocumentFromReference(reference: FirestoreDocumentReferenceLike, state = this.collections) {
    const resolved = this.asReference(reference);
    this.deleteDocument(
      resolved["collectionName" as keyof InMemoryDocumentReference] as string,
      resolved.id,
      state,
    );
  }
}
