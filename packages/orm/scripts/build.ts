import { build } from "tsup";

await build({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm", "cjs"],
  sourcemap: true,
  clean: true,
  outDir: "dist"
});
