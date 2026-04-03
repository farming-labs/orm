type RecordNode = Record<string, unknown>;
type UniqueNode = {
  __ormNamespace: string;
  __ormKey: string;
  __ormTargetDocId: string;
};

type Neo4jStore = {
  records: RecordNode[];
  uniques: UniqueNode[];
};

type Neo4jRecordLike = {
  get(key: string): unknown;
  toObject(): Record<string, unknown>;
};

type Neo4jResultLike = {
  records: Neo4jRecordLike[];
};

type LocalNeo4jTransaction = {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jResultLike>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
};

type LocalNeo4jSession = {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jResultLike>;
  beginTransaction(): Promise<LocalNeo4jTransaction>;
  executeRead<TResult>(run: (tx: LocalNeo4jTransaction) => Promise<TResult>): Promise<TResult>;
  executeWrite<TResult>(run: (tx: LocalNeo4jTransaction) => Promise<TResult>): Promise<TResult>;
  close(): Promise<void>;
};

export type LocalNeo4jHarness = {
  client: {
    session(config?: { database?: string }): LocalNeo4jSession;
    close(): Promise<void>;
    verifyConnectivity(): Promise<void>;
    getServerInfo(): Promise<{ address: string }>;
  };
  close(): Promise<void>;
};

function cloneStore(store: Neo4jStore): Neo4jStore {
  return structuredClone(store);
}

function createRecord(values: Record<string, unknown>): Neo4jRecordLike {
  return {
    get(key: string) {
      return values[key];
    },
    toObject() {
      return values;
    },
  };
}

function createResult(records: Array<Record<string, unknown>>): Neo4jResultLike {
  return {
    records: records.map((record) => createRecord(record)),
  };
}

async function executeQuery(
  store: Neo4jStore,
  query: string,
  params: Record<string, unknown> = {},
): Promise<Neo4jResultLike> {
  if (query.includes("farm_orm:loadRecordByDocId")) {
    const record = store.records.find(
      (entry) =>
        entry.__ormNamespace === params.namespace &&
        entry.__ormModel === params.model &&
        entry.__ormDocId === params.docId,
    );
    return createResult(record ? [{ props: structuredClone(record) }] : []);
  }

  if (query.includes("farm_orm:loadRecords")) {
    const records = store.records
      .filter(
        (entry) => entry.__ormNamespace === params.namespace && entry.__ormModel === params.model,
      )
      .map((entry) => ({ props: structuredClone(entry) }));
    return createResult(records);
  }

  if (query.includes("farm_orm:createRecord")) {
    store.records.push(structuredClone(params.props as RecordNode));
    return createResult([{ props: structuredClone(params.props as RecordNode) }]);
  }

  if (query.includes("farm_orm:updateRecord")) {
    const index = store.records.findIndex(
      (entry) =>
        entry.__ormNamespace === params.namespace &&
        entry.__ormModel === params.model &&
        entry.__ormDocId === params.docId,
    );

    if (index >= 0) {
      store.records[index] = structuredClone(params.props as RecordNode);
      return createResult([{ props: structuredClone(store.records[index]!) }]);
    }

    return createResult([]);
  }

  if (query.includes("farm_orm:deleteRecord")) {
    store.records = store.records.filter(
      (entry) =>
        !(
          entry.__ormNamespace === params.namespace &&
          entry.__ormModel === params.model &&
          entry.__ormDocId === params.docId
        ),
    );
    return createResult([]);
  }

  if (query.includes("farm_orm:getUnique")) {
    const lock = store.uniques.find(
      (entry) => entry.__ormNamespace === params.namespace && entry.__ormKey === params.key,
    );
    return createResult(lock ? [{ targetDocId: lock.__ormTargetDocId }] : []);
  }

  if (query.includes("farm_orm:putUnique")) {
    const existing = store.uniques.find(
      (entry) => entry.__ormNamespace === params.namespace && entry.__ormKey === params.key,
    );
    if (!existing) {
      store.uniques.push({
        __ormNamespace: String(params.namespace),
        __ormKey: String(params.key),
        __ormTargetDocId: String(params.targetDocId),
      });
      return createResult([{ targetDocId: String(params.targetDocId) }]);
    }

    return createResult([{ targetDocId: existing.__ormTargetDocId }]);
  }

  if (query.includes("farm_orm:deleteUnique")) {
    store.uniques = store.uniques.filter(
      (entry) => !(entry.__ormNamespace === params.namespace && entry.__ormKey === params.key),
    );
    return createResult([]);
  }

  if (query.includes("CREATE CONSTRAINT") || query.includes("CREATE INDEX")) {
    return createResult([]);
  }

  throw new Error(`Unsupported Neo4j test query: ${query}`);
}

function createSession(storeRef: { current: Neo4jStore }): LocalNeo4jSession {
  return {
    async run(query, params) {
      return executeQuery(storeRef.current, query, params);
    },
    async beginTransaction() {
      const snapshot = cloneStore(storeRef.current);
      let closed = false;
      let finished = false;

      const tx: LocalNeo4jTransaction = {
        async run(query, params) {
          if (closed) {
            throw new Error("Transaction is already closed.");
          }
          return executeQuery(snapshot, query, params);
        },
        async commit() {
          if (finished) return;
          storeRef.current = cloneStore(snapshot);
          finished = true;
        },
        async rollback() {
          finished = true;
        },
        async close() {
          closed = true;
        },
      };

      return tx;
    },
    async executeRead(run) {
      const tx = await this.beginTransaction();
      try {
        return await run(tx);
      } finally {
        await tx.close();
      }
    },
    async executeWrite(run) {
      const tx = await this.beginTransaction();
      try {
        const result = await run(tx);
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally {
        await tx.close();
      }
    },
    async close() {
      return;
    },
  };
}

export async function startLocalNeo4j(): Promise<LocalNeo4jHarness> {
  const storeRef = {
    current: {
      records: [],
      uniques: [],
    } satisfies Neo4jStore,
  };

  return {
    client: {
      session() {
        return createSession(storeRef);
      },
      async close() {
        return;
      },
      async verifyConnectivity() {
        return;
      },
      async getServerInfo() {
        return {
          address: "local-neo4j",
        };
      },
    },
    async close() {
      return;
    },
  };
}
