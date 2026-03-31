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
