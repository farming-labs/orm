import { Miniflare } from "miniflare";
import type { D1DatabaseLike } from "../../src";

const localDatabaseId = "00000000-0000-0000-0000-000000000001";

export async function startLocalD1() {
  const miniflare = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    d1Databases: {
      DB: localDatabaseId,
    },
  });

  return {
    db: (await miniflare.getD1Database("DB")) as D1DatabaseLike,
    close: async () => {
      await miniflare.dispose();
    },
  };
}
