import { Miniflare } from "miniflare";
import type { KvClientLike } from "../../src";

export async function startLocalKv() {
  const miniflare = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    kvNamespaces: ["KV"],
  });

  return {
    client: (await miniflare.getKVNamespace("KV")) as unknown as KvClientLike,
    close: async () => {
      await miniflare.dispose();
    },
  };
}
