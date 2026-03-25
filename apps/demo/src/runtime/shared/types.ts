import type { AuthOrm } from "../../auth-store";

export type DemoAdapterName =
  | "memory"
  | "sqlite"
  | "drizzle-sqlite"
  | "prisma"
  | "postgres-pool"
  | "postgres-client"
  | "drizzle-postgres"
  | "mysql-pool"
  | "mysql-connection"
  | "drizzle-mysql"
  | "mongoose";

export type DemoAdapterInput = DemoAdapterName | "all";

export type DirectCheckResult = {
  id: string;
  email: string;
} | null;

export type AvailabilityResult = {
  available: boolean;
  reason?: string;
};

export type DemoRuntimeHandle = {
  name: DemoAdapterName;
  label: string;
  client: string;
  orm: AuthOrm;
  directCheck?: (userId: string) => Promise<DirectCheckResult>;
  close: () => Promise<void>;
};

export type DemoAdapterFactory = {
  label: string;
  client: string;
  availability: () => Promise<AvailabilityResult>;
  create: () => Promise<DemoRuntimeHandle>;
};
