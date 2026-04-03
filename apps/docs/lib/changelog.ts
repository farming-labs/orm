export type ChangelogEntry = {
  version: string;
  anchor: string;
  date: string;
  title: string;
  summary: string;
  tags: string[];
  highlights: string[];
};

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "v0.0.48",
    anchor: "v0-0-48",
    date: "April 3, 2026",
    title: "Supabase JS runtime and docs alignment",
    summary:
      "Added a dedicated Supabase JS runtime so apps can pass `createClient(...)` directly while keeping the original PostgreSQL Supabase path intact.",
    tags: ["runtime", "supabase", "docs"],
    highlights: [
      "Added `@farming-labs/orm-supabase` as a direct Supabase table-API runtime instead of routing through a hidden raw `pg` bridge.",
      "Kept the existing Supabase PostgreSQL helpers in `@farming-labs/orm-sql`, so apps can choose either the raw SQL path or the Supabase client path honestly.",
      "Updated docs, skill guidance, and changelog/navigation polish so the two Supabase paths are easier to understand.",
    ],
  },
  {
    version: "v0.0.47",
    anchor: "v0-0-47",
    date: "April 3, 2026",
    title: "EdgeDB / Gel runtime support",
    summary:
      "Added EdgeDB / Gel as a runtime-first bridge through the official Gel SQL client while keeping schema ownership in the app's own Gel workflow.",
    tags: ["runtime", "edgedb", "gel"],
    highlights: [
      "Added `@farming-labs/orm-edgedb` so a real Gel SQL client can power the unified ORM query layer directly.",
      "Kept setup intentionally conservative by treating the runtime as a query bridge rather than a replacement for Gel schema or migration management.",
      "Updated docs, runtime helpers, and icons so EdgeDB / Gel reads like a first-class integration instead of a generic SQL footnote.",
    ],
  },
  {
    version: "v0.0.46",
    anchor: "v0-0-46",
    date: "April 2, 2026",
    title: "Cloudflare KV runtime support",
    summary:
      "Added a worker-native Cloudflare KV runtime for lightweight edge state, sessions, tokens, and framework-owned key-value workflows.",
    tags: ["runtime", "cloudflare", "kv"],
    highlights: [
      "Added `@farming-labs/orm-kv` so a real `KVNamespace` can power the same schema and query surface as the other runtimes.",
      "Kept `pushSchema(...)` and `applySchema(...)` as honest no-ops while still supporting `bootstrapDatabase(...)` as the one-shot runtime entrypoint.",
      "Documented the runtime as a strong fit for edge key-value state rather than highly relational or join-heavy database workloads.",
    ],
  },
  {
    version: "v0.0.45",
    anchor: "v0-0-45",
    date: "April 2, 2026",
    title: "Security CI cleanup",
    summary:
      "Followed the new runtime work with another security and CI cleanup pass so the audit and test pipeline stayed healthy as the matrix grew.",
    tags: ["security", "ci", "maintenance"],
    highlights: [
      "Tightened the security CI path so dependency and audit issues surfaced earlier in the release flow.",
      "Kept the growing runtime matrix stable without turning every cleanup pass into a breaking release.",
      "Used a small maintenance release to keep momentum while broader runtime work kept shipping separately.",
    ],
  },
  {
    version: "v0.0.44",
    anchor: "v0-0-44",
    date: "April 2, 2026",
    title: "Audit and pipeline hardening",
    summary:
      "Added another security-oriented maintenance pass to keep audit output, CI expectations, and release hygiene in shape.",
    tags: ["security", "audit", "ci"],
    highlights: [
      "Cleaned up another round of security CI and audit work ahead of the next runtime additions.",
      "Kept the release cadence moving without bundling the maintenance pass into a larger feature release.",
      "Reduced the amount of security and dependency noise around the expanding adapter surface.",
    ],
  },
  {
    version: "v0.0.43",
    anchor: "v0-0-43",
    date: "April 2, 2026",
    title: "Redis / Upstash runtime support",
    summary:
      "Added a shared Redis runtime family for Redis and Upstash-compatible clients, aimed at sessions, tokens, cache metadata, and rate limits.",
    tags: ["runtime", "redis", "upstash"],
    highlights: [
      "Added `@farming-labs/orm-redis` as a key-value runtime that works across Redis and Upstash-style clients.",
      "Mapped ORM-managed unique lookups and fallback relation reads onto a Redis-friendly storage model.",
      "Kept the docs explicit that this runtime is a strong fit for lightweight package-owned state, not highly relational workloads.",
    ],
  },
  {
    version: "v0.0.42",
    anchor: "v0-0-42",
    date: "April 2, 2026",
    title: "Cloudflare D1 runtime support",
    summary:
      "Added Cloudflare D1 as a worker-native SQL runtime so the same ORM layer can run directly on a D1 binding or local Miniflare setup.",
    tags: ["runtime", "cloudflare", "d1"],
    highlights: [
      "Added `@farming-labs/orm-d1` so a real `D1Database` binding can back the unified ORM query surface.",
      "Kept the runtime worker-friendly while leaving `@farming-labs/orm-runtime/setup` in the Node/local bootstrap path.",
      "Documented the D1 transaction and bigint boundaries honestly instead of over-promising full long-lived SQL semantics.",
    ],
  },
  {
    version: "v0.0.41",
    anchor: "v0-0-41",
    date: "April 1, 2026",
    title: "Post-docs cleanup and OG polish",
    summary:
      "Smoothed the docs app after the changelog and runtime expansion work by cleaning up OG behavior, icons, and smaller docs inconsistencies.",
    tags: ["docs", "og", "polish"],
    highlights: [
      "Cleaned up the docs app after the bigger changelog and runtime documentation work landed.",
      "Improved the OG and metadata path so sharing and preview behavior felt more deliberate.",
      "Tightened smaller icon and docs details without changing the underlying runtime surface.",
    ],
  },
  {
    version: "v0.0.40",
    anchor: "v0-0-40",
    date: "April 1, 2026",
    title: "MikroORM runtime support",
    summary:
      "Added MikroORM as another first-class relational runtime so apps can pass a real MikroORM instance or EntityManager into the shared ORM layer.",
    tags: ["runtime", "mikroorm", "sql"],
    highlights: [
      "Added `@farming-labs/orm-mikroorm` for PostgreSQL and MySQL-style relational workflows.",
      "Kept runtime helpers and setup flows aligned so a raw MikroORM runtime can still become a typed Farming ORM client cleanly.",
      "Updated docs and branding so MikroORM shows up as a real supported path across the docs app.",
    ],
  },
  {
    version: "v0.0.39",
    anchor: "v0-0-39",
    date: "March 31, 2026",
    title: "OG images and metadata polish",
    summary:
      "Added a stronger OG image path and metadata cleanup so the docs and changelog pages share better across previews and social cards.",
    tags: ["docs", "og", "metadata"],
    highlights: [
      "Added a dynamic OG image path for the docs app and changelog surface.",
      "Tightened metadata and analytics wiring so previews matched the visual direction of the site.",
      "Used a small release to make the docs feel more like a polished product instead of a raw documentation shell.",
    ],
  },
  {
    version: "v0.0.38",
    anchor: "v0-0-38",
    date: "March 31, 2026",
    title: "Standalone changelog experience",
    summary:
      "Added the dedicated changelog page and timeline experience so releases can be tracked outside the docs shell with a stronger editorial feel.",
    tags: ["docs", "changelog", "ui"],
    highlights: [
      "Added the standalone `/changelogs` page with version navigation and a text-first timeline layout.",
      "Connected the homepage navigation and docs metadata to the new changelog surface.",
      "Used the same site hero language and mono-forward styling to make release notes feel like part of the product, not an afterthought.",
    ],
  },
  {
    version: "v0.0.37",
    anchor: "v0-0-37",
    date: "March 31, 2026",
    title: "Unstorage runtime and lighter docs polish",
    summary:
      "Added the Unstorage runtime family, cleaned up integration guides, and tightened the docs experience around support and framework-level usage.",
    tags: ["runtime", "unstorage", "docs"],
    highlights: [
      "Added a dedicated Unstorage runtime for lightweight key-value and document-style workflows.",
      "Expanded runtime and integration docs so one storage layer can map cleanly across SQL, document, and key-value stacks.",
      "Trimmed heavier verification sections so the docs read like product guides instead of internal QA notes.",
    ],
  },
  {
    version: "v0.0.36",
    anchor: "v0-0-36",
    date: "March 31, 2026",
    title: "DynamoDB hardening and support-surface cleanup",
    summary:
      "Followed the DynamoDB runtime work with review fixes, better support callouts, and a cleaner framework-author story.",
    tags: ["runtime", "dynamodb", "hardening"],
    highlights: [
      "Hardened DynamoDB fallback mutation paths so failed writes do not leave partial state behind.",
      "Improved support-matrix and framework-author docs so runtime choices are easier to understand.",
      "Kept the same one-schema, one-storage-layer story while tightening the runtime boundaries.",
    ],
  },
  {
    version: "v0.0.35",
    anchor: "v0-0-35",
    date: "March 31, 2026",
    title: "DynamoDB runtime arrives",
    summary:
      "Added a first-class DynamoDB runtime so document and key-value workloads can use the same Farming ORM schema and query surface.",
    tags: ["runtime", "dynamodb", "aws"],
    highlights: [
      "Added raw DynamoDB runtime support with bootstrap helpers and runtime detection.",
      "Mapped auth-style lookups, fallback relations, and compound unique behavior onto DynamoDB.",
      "Documented the tradeoffs clearly around joins, generated numeric ids, and transaction semantics.",
    ],
  },
  {
    version: "v0.0.34",
    anchor: "v0-0-34",
    date: "March 30, 2026",
    title: "Sequelize runtime support",
    summary:
      "Brought Sequelize into the runtime family so PostgreSQL and MySQL apps can reuse the same package-level storage contract without adapter sprawl.",
    tags: ["runtime", "sequelize", "sql"],
    highlights: [
      "Added Sequelize runtime translation for real PostgreSQL and MySQL application stacks.",
      "Kept runtime helpers and setup flows aligned with the rest of the relational integrations.",
      "Documented the Sequelize path with the same shared-schema and shared-store framing used across the docs.",
    ],
  },
  {
    version: "v0.0.33",
    anchor: "v0-0-33",
    date: "March 30, 2026",
    title: "TypeORM runtime support",
    summary:
      "Added TypeORM as another first-class relational runtime so app-owned DataSources can plug directly into the Farming ORM layer.",
    tags: ["runtime", "typeorm", "sql"],
    highlights: [
      "Added TypeORM driver support for apps that already own a live DataSource.",
      "Kept the runtime helper path consistent so raw clients can still become a typed ORM at the framework boundary.",
      "Added docs and local verification for PostgreSQL, MySQL, and SQLite-family coverage.",
    ],
  },
  // {
  //   version: "v0.0.31",
  //   anchor: "v0-0-31",
  //   date: "March 30, 2026",
  //   title: "Firestore runtime support",
  //   summary:
  //     "Added a Firestore runtime family for server-side Firebase workflows while keeping the same schema and storage-contract story.",
  //   tags: ["runtime", "firestore", "firebase"],
  //   highlights: [
  //     "Added Firestore runtime detection, document operations, and runtime helpers.",
  //     "Kept relation loading and unique workflows explicit about their document-store tradeoffs.",
  //     "Made it easier for frameworks and packages to accept Firebase-backed storage without inventing a separate adapter layer.",
  //   ],
  // },
  // {
  //   version: "v0.0.30",
  //   anchor: "v0-0-30",
  //   date: "March 30, 2026",
  //   title: "Supabase runtime path and adapter-ecosystem docs",
  //   summary:
  //     "Clarified the PostgreSQL-platform path for Supabase and pushed the docs harder toward the one-schema, one-storage-layer model.",
  //   tags: ["runtime", "supabase", "docs"],
  //   highlights: [
  //     "Added a documented Supabase path through the PostgreSQL runtime rather than a separate database model.",
  //     "Expanded the docs around adapter replacement so auth and framework packages can write storage once.",
  //     "Kept generated artifacts, runtime helpers, and setup helpers aligned under the same schema contract.",
  //   ],
  // },
];

export const latestChangelogEntry = changelogEntries[0];
