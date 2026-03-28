import "server-only";

import { PrismaClient } from "@prisma/client";

type GlobalPrismaState = typeof globalThis & {
  __ormDocsPrisma?: PrismaClient;
};

const globalPrismaState = globalThis as GlobalPrismaState;

export const prisma =
  globalPrismaState.__ormDocsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalPrismaState.__ormDocsPrisma = prisma;
}
