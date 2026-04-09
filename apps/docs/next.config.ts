import path from "node:path";
import { withDocs } from "@farming-labs/next/config";

export default withDocs({
  reactStrictMode: true,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  turbopack: {
    resolveAlias: {
      "@/docs.config": "./docs.config.tsx",
    },
  },
});
