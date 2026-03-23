import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import {
  replaceGeneratedBlock,
  renderDrizzleSchema,
  renderPrismaSchema,
  renderSafeSql,
  type DrizzleGenerationOptions,
  type PrismaGenerationOptions,
  type SchemaDefinition,
  type SqlGenerationOptions,
} from "@farming-labs/orm";

export type FarmOrmConfig = {
  schemas: Array<SchemaDefinition<any>>;
  targets: {
    prisma?: PrismaGenerationOptions & {
      out: string;
      mode?: "block" | "replace";
    };
    drizzle?: DrizzleGenerationOptions & {
      out: string;
    };
    sql?: SqlGenerationOptions & {
      out: string;
    };
  };
};

export function defineConfig(config: FarmOrmConfig) {
  return config;
}

export async function loadConfig(configPath = "farm-orm.config.ts") {
  const absolutePath = path.resolve(process.cwd(), configPath);
  const jiti = createJiti(process.cwd());
  const mod = (await jiti.import(absolutePath)) as any;
  const config = (mod.default ?? mod) as FarmOrmConfig;

  if (!config?.schemas?.length) {
    throw new Error(`No schemas found in ${absolutePath}`);
  }

  return { absolutePath, config };
}

function mergeSchemas(schemas: Array<SchemaDefinition<any>>) {
  const models: Record<string, any> = {};
  for (const schema of schemas) {
    for (const [modelName, definition] of Object.entries(schema.models)) {
      if (models[modelName]) {
        throw new Error(`Duplicate model "${modelName}" detected while merging schemas.`);
      }
      models[modelName] = definition;
    }
  }
  return {
    _tag: "schema",
    models,
  } as SchemaDefinition<any>;
}

async function ensureFileDirectory(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readIfExists(filePath: string) {
  if (!existsSync(filePath)) return "";
  return readFile(filePath, "utf8");
}

export async function generateTarget(
  target: keyof FarmOrmConfig["targets"],
  configPath?: string,
) {
  const { config } = await loadConfig(configPath);
  const schema = mergeSchemas(config.schemas);

  if (target === "prisma") {
    const targetConfig = config.targets.prisma;
    if (!targetConfig) {
      throw new Error(`Target "${target}" is not configured.`);
    }
    const outputPath = path.resolve(process.cwd(), targetConfig.out);
    const rendered = renderPrismaSchema(schema, targetConfig);
    const mode = targetConfig.mode ?? "block";
    const current = await readIfExists(outputPath);
    const next =
      mode === "replace" || current.trim().length === 0
        ? rendered
        : replaceGeneratedBlock({
            current,
            label: "prisma",
            content: rendered,
          });
    await ensureFileDirectory(outputPath);
    await writeFile(outputPath, next, "utf8");
    return outputPath;
  }

  if (target === "drizzle") {
    const targetConfig = config.targets.drizzle;
    if (!targetConfig) {
      throw new Error(`Target "${target}" is not configured.`);
    }
    const outputPath = path.resolve(process.cwd(), targetConfig.out);
    await ensureFileDirectory(outputPath);
    await writeFile(
      outputPath,
      renderDrizzleSchema(schema, targetConfig),
      "utf8",
    );
    return outputPath;
  }

  const targetConfig = config.targets.sql;
  if (!targetConfig) {
    throw new Error(`Target "${target}" is not configured.`);
  }
  const outputPath = path.resolve(process.cwd(), targetConfig.out);
  await ensureFileDirectory(outputPath);
  await writeFile(outputPath, renderSafeSql(schema, targetConfig), "utf8");
  return outputPath;
}

export async function checkTarget(
  target: keyof FarmOrmConfig["targets"],
  configPath?: string,
) {
  const { config } = await loadConfig(configPath);
  const schema = mergeSchemas(config.schemas);

  if (target === "prisma") {
    const targetConfig = config.targets.prisma;
    if (!targetConfig) {
      throw new Error(`Target "${target}" is not configured.`);
    }
    const outputPath = path.resolve(process.cwd(), targetConfig.out);
    const current = await readIfExists(outputPath);
    const next =
      targetConfig.mode === "replace" || !current.trim()
        ? renderPrismaSchema(schema, targetConfig)
        : replaceGeneratedBlock({
            current,
            label: "prisma",
            content: renderPrismaSchema(schema, targetConfig),
          });

    return {
      path: outputPath,
      matches: current === next,
    };
  }

  if (target === "drizzle") {
    const targetConfig = config.targets.drizzle;
    if (!targetConfig) {
      throw new Error(`Target "${target}" is not configured.`);
    }
    const outputPath = path.resolve(process.cwd(), targetConfig.out);
    const current = await readIfExists(outputPath);
    const next = renderDrizzleSchema(schema, targetConfig);
    return {
      path: outputPath,
      matches: current === next,
    };
  }

  const targetConfig = config.targets.sql;
  if (!targetConfig) {
    throw new Error(`Target "${target}" is not configured.`);
  }
  const outputPath = path.resolve(process.cwd(), targetConfig.out);
  const current = await readIfExists(outputPath);
  const next = renderSafeSql(schema, targetConfig);
  return {
    path: outputPath,
    matches: current === next,
  };
}
