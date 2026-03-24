import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrm } from "@farming-labs/orm";
import { createPrismaDriver } from "../src";
import {
  assertBelongsToAndManyToManyQueries,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  schema,
  type RuntimeOrm,
} from "./support/auth";

const LOCAL_TIMEOUT_MS = 20_000;

type PrismaClientLike = {
  user: { deleteMany(): Promise<unknown> };
  profile: { deleteMany(): Promise<unknown> };
  session: { deleteMany(): Promise<unknown> };
  organization: { deleteMany(): Promise<unknown> };
  member: { deleteMany(): Promise<unknown> };
  $disconnect(): Promise<void>;
};

let prisma: PrismaClientLike;

async function resetDatabase() {
  await prisma.member.deleteMany();
  await prisma.session.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

async function withLocalOrm<TResult>(run: (orm: RuntimeOrm) => Promise<TResult>) {
  const orm = createOrm({
    schema,
    driver: createPrismaDriver({
      client: prisma as any,
    }),
  }) as RuntimeOrm;

  await resetDatabase();

  try {
    return await run(orm);
  } finally {
    await resetDatabase();
  }
}

beforeAll(async () => {
  const prismaModule = await import("@prisma/client");
  const PrismaClient = (prismaModule as any).PrismaClient as new () => PrismaClientLike;
  prisma = new PrismaClient();
});

afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});

describe("prisma local integration", () => {
  it(
    "supports one-to-one and one-to-many reads against a real Prisma client",
    async () => {
      await withLocalOrm((orm) => assertOneToOneAndHasManyQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports belongsTo and many-to-many traversal against a real Prisma client",
    async () => {
      await withLocalOrm((orm) => assertBelongsToAndManyToManyQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports updates, upserts, deletes, and transaction rollback against a real Prisma client",
    async () => {
      await withLocalOrm((orm) =>
        assertMutationQueries(orm, expect, { expectTransactionRollback: true }),
      );
    },
    LOCAL_TIMEOUT_MS,
  );
});
