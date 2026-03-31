import docsConfig from "../../docs.config";
import { createNextDocsLayout, createNextDocsMetadata } from "@farming-labs/next/layout";

export const metadata = {
  metadataBase: new URL("https://docs.farming-labs.dev"),
  ...createNextDocsMetadata(docsConfig),
};

const DocsLayout = createNextDocsLayout(docsConfig);

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DocsLayout>{children}</DocsLayout>;
}
