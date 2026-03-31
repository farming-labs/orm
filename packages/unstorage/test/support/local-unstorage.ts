import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import fsLiteDriver from "unstorage/drivers/fs-lite";
import type { UnstorageClientLike } from "../../src";

export type LocalUnstorageTarget = "memory" | "fs-lite";

export async function startLocalUnstorage(target: LocalUnstorageTarget = "memory") {
  if (target === "memory") {
    const storage = createStorage({
      driver: memoryDriver(),
    });

    return {
      storage: storage as UnstorageClientLike,
      close: async () => {
        await storage.dispose();
      },
    };
  }

  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-unstorage-"));
  const storage = createStorage({
    driver: fsLiteDriver({
      base: directory,
    }),
  });

  return {
    storage: storage as UnstorageClientLike,
    close: async () => {
      await storage.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
