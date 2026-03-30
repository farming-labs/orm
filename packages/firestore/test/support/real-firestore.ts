import path from "node:path";
import { createManifest } from "@farming-labs/orm";
import type { SchemaDefinition } from "@farming-labs/orm";
import { createIsolatedName } from "../../../mongoose/test/support/auth";
import type { FirestoreCollectionMap } from "../../src";

type RealFirestoreModule = typeof import("@google-cloud/firestore");
type RealFirestoreInstance = InstanceType<RealFirestoreModule["Firestore"]>;

function loadWorkspaceEnvFile() {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  try {
    process.loadEnvFile?.(rootEnvPath);
  } catch {}
}

loadWorkspaceEnvFile();

function parseInlineCredentials() {
  const inlineJson =
    process.env.FARM_ORM_LOCAL_FIRESTORE_SERVICE_ACCOUNT_JSON ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!inlineJson) return null;

  const normalizedInlineJson = inlineJson.trim();
  const firstPass = JSON.parse(normalizedInlineJson) as
    | string
    | {
        client_email?: string;
        private_key?: string;
        project_id?: string;
      };
  const parsed = (typeof firstPass === "string" ? JSON.parse(firstPass) : firstPass) as {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Firestore inline credentials must include client_email and private_key.");
  }

  return parsed;
}

export function shouldRunRealFirestoreTests() {
  if (
    process.env.FARM_ORM_SKIP_REAL_FIRESTORE_TESTS === "1" ||
    process.env.FARM_ORM_SKIP_REAL_FIRESTORE_TESTS === "true"
  ) {
    return false;
  }

  if (
    process.env.FARM_ORM_FORCE_REAL_FIRESTORE_TESTS === "1" ||
    process.env.FARM_ORM_FORCE_REAL_FIRESTORE_TESTS === "true"
  ) {
    return true;
  }

  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FARM_ORM_LOCAL_FIRESTORE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  );
}

export function firestoreTestProjectId() {
  return (
    process.env.FARM_ORM_LOCAL_FIRESTORE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    parseInlineCredentials()?.project_id ??
    (process.env.FIRESTORE_EMULATOR_HOST ? "farm-orm-local" : undefined)
  );
}

export async function createRealFirestoreClient() {
  const { Firestore } = (await import("@google-cloud/firestore")) as RealFirestoreModule;
  const inlineCredentials = parseInlineCredentials();
  const projectId = firestoreTestProjectId();

  if (!projectId) {
    throw new Error(
      "Firestore real integration tests require GOOGLE_CLOUD_PROJECT or FARM_ORM_LOCAL_FIRESTORE_PROJECT_ID.",
    );
  }

  if (inlineCredentials) {
    return new Firestore({
      projectId,
      credentials: {
        client_email: inlineCredentials.client_email!,
        private_key: inlineCredentials.private_key!,
      },
    });
  }

  return new Firestore({
    projectId,
  });
}

export function createPrefixedCollections<TSchema extends SchemaDefinition<any>>(
  db: RealFirestoreInstance,
  schema: TSchema,
) {
  const manifest = createManifest(schema);
  const prefix = createIsolatedName("farm_orm_firestore");

  return Object.fromEntries(
    Object.keys(schema.models).map((modelName) => [
      modelName,
      db.collection(`${prefix}_${manifest.models[modelName]!.table}`),
    ]),
  ) as unknown as FirestoreCollectionMap<TSchema>;
}

async function clearCollection(
  collection: Awaited<ReturnType<RealFirestoreInstance["collection"]>>,
) {
  while (true) {
    const snapshot = await collection.get();
    if (!snapshot.docs.length) {
      return;
    }

    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

export async function cleanupPrefixedCollections<TSchema extends SchemaDefinition<any>>(
  collections: FirestoreCollectionMap<TSchema>,
) {
  await Promise.all(
    Object.values(collections).map((collection) =>
      collection
        ? clearCollection(collection as Awaited<ReturnType<RealFirestoreInstance["collection"]>>)
        : undefined,
    ),
  );
}
