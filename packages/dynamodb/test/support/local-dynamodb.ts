import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import dynalite from "dynalite";
import type { AddressInfo } from "node:net";

export async function startLocalDynamoDb() {
  const server = dynalite({
    createTableMs: 0,
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}`;
  const client = new DynamoDBClient({
    region: "local",
    endpoint,
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return {
    endpoint,
    client,
    documentClient,
    close: async () => {
      client.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
