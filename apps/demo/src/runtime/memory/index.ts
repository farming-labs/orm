import { createMemoryDriver, createOrm } from "@farming-labs/orm";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import type { DemoRuntimeHandle } from "../shared/types";
import { memorySeed } from "../shared/memory-seed";

export async function createMemoryRuntime(): Promise<DemoRuntimeHandle> {
  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createMemoryDriver<typeof authSchema>(memorySeed()),
  });

  return {
    name: "memory",
    label: "Memory runtime",
    client: "Seeded in-memory store",
    orm,
    close: async () => {},
  };
}
