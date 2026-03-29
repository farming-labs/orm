import { defineConfig } from "bumpp";

export default defineConfig({
  commit: "chore: release v%s",
  tag: "v%s",
  push: true,
  recursive: true,
  execute: "pnpm build",
});
