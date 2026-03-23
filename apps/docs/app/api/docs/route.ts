import docsConfig from "../../../docs.config";
import { createDocsAPI } from "@farming-labs/theme/api";

export const { GET, POST } = createDocsAPI({
  entry: docsConfig.entry,
  i18n: docsConfig.i18n,
});

export const revalidate = false;
