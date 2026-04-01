import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "redis";
import type { RedisClientLike } from "../../src";

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a local Redis port.")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForRedis(url: string, timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const probe = createClient({ url });
    probe.on("error", () => undefined);

    try {
      await probe.connect();
      await probe.ping();
      await probe.quit();
      return;
    } catch {
      try {
        await probe.disconnect();
      } catch {
        // Ignore probe cleanup failures.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error("Timed out while starting the local Redis server.");
}

export async function startLocalRedis() {
  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-redis-"));
  const port = await getFreePort();
  const url = `redis://127.0.0.1:${port}`;
  const server = spawn(
    "redis-server",
    [
      "--bind",
      "127.0.0.1",
      "--port",
      String(port),
      "--dir",
      directory,
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let exited = false;
  server.once("exit", () => {
    exited = true;
  });

  try {
    await waitForRedis(url);
  } catch (error) {
    if (!exited) {
      server.kill("SIGTERM");
      await once(server, "exit").catch(() => undefined);
    }
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  const client = createClient({ url });
  client.on("error", () => undefined);
  await client.connect();

  return {
    client: client as unknown as RedisClientLike,
    url,
    close: async () => {
      try {
        if (client.isOpen) {
          await client.quit();
        } else {
          client.destroy();
        }
      } catch {
        try {
          client.destroy();
        } catch {
          // Ignore client cleanup failures.
        }
      }

      if (!exited) {
        server.kill("SIGTERM");
        await once(server, "exit").catch(() => undefined);
      }

      await rm(directory, { recursive: true, force: true });
    },
  };
}
