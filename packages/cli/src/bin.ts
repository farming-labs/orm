#!/usr/bin/env node

import { Command } from "commander";
import { checkTarget, generateTarget } from "./index";

const program = new Command();

program
  .name("farm-orm")
  .description("Generate Prisma, Drizzle, or safe SQL artifacts from @farming-labs/orm schemas.");

program
  .command("generate")
  .argument("<target>", "Target to generate: prisma, drizzle, or sql")
  .option("-c, --config <path>", "Path to the farm-orm config file", "farm-orm.config.ts")
  .action(async (target: "prisma" | "drizzle" | "sql", options) => {
    const outputPath = await generateTarget(target, options.config);
    console.log(`Generated ${target} output at ${outputPath}`);
  });

program
  .command("check")
  .argument("<target>", "Target to validate: prisma, drizzle, or sql")
  .option("-c, --config <path>", "Path to the farm-orm config file", "farm-orm.config.ts")
  .action(async (target: "prisma" | "drizzle" | "sql", options) => {
    const result = await checkTarget(target, options.config);
    if (!result.matches) {
      console.error(`${target} output is out of date: ${result.path}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${target} output is up to date.`);
  });

program.parseAsync(process.argv);
