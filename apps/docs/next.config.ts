import path from "node:path";
import { withDocs } from "@farming-labs/next/config";

const repoRoot = path.resolve(process.cwd(), "..");

export default withDocs({
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      "@/docs.config": "./docs.config.tsx",
    },
  },
});
