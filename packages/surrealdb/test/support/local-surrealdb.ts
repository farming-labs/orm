import { createNodeEngines } from "@surrealdb/node";
import { createRemoteEngines, Surreal } from "surrealdb";
import type { SurrealDbClientLike } from "../../src";

function randomSegment() {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return randomUuid.call(globalThis.crypto).replace(/-/g, "");
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function startLocalSurrealDb() {
  const namespace = `farm_orm_${randomSegment()}`;
  const database = `runtime_${randomSegment()}`;
  const client = new Surreal({
    engines: {
      ...createRemoteEngines(),
      ...createNodeEngines(),
    },
  });

  await client.connect("mem://");
  await client.use({
    namespace,
    database,
  });

  return {
    client: client as unknown as SurrealDbClientLike,
    namespace,
    database,
    async close() {
      await client.close();
    },
  };
}
