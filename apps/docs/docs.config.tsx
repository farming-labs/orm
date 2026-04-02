import type { ReactNode } from "react";
import { defineDocs } from "@farming-labs/docs";
import { pixelBorder } from "@farming-labs/theme/pixel-border";
import {
  siCloudflare,
  siDrizzle,
  siFirebase,
  siMongodb,
  siPrisma,
  siSequelize,
  siSupabase,
  siTypeorm,
  siUnjs,
} from "simple-icons";
import {
  BookOpen,
  Boxes,
  Building2,
  Code2,
  CreditCard,
  Database,
  Braces,
  FileCode2,
  HardDrive,
  Network,
  Package,
  Rocket,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  LayoutGrid,
  Pin,
} from "lucide-react";
import { submitDocsFeedback } from "./lib/feedback";
import { latestChangelogEntry } from "./lib/changelog";

const icon = (node: ReactNode) => (
  <span className="flex size-4 shrink-0 items-center justify-center text-white/70 [&_svg]:size-4">
    {node}
  </span>
);

const brandIcon = (path: string, title: string) =>
  icon(
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" role="img">
      <title>{title}</title>
      <path d={path} />
    </svg>,
  );

const dynamodbIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 64 64" role="img">
    <title>Amazon DynamoDB</title>
    <path
      fill="currentColor"
      d="M46.586 25.249h-3.585a1.02 1.02 0 0 1-.822-.435 1.02 1.02 0 0 1-.114-.931l2.493-6.721h-8.914l-4.09 9.098H36a1.01 1.01 0 0 1 .812.42c.187.263.239.601.136.91l-3.66 11.101zm3.12-.296L31.708 43.149a1.004 1.004 0 0 1-1.23.146.998.998 0 0 1-.426-1.18l4.56-13.833h-4.611a1.02 1.02 0 0 1-.842-.463 1.024 1.024 0 0 1-.068-.966l5-11.12a1.006 1.006 0 0 1 .91-.593h11c.328 0 .635.163.822.435.187.273.23.62.115.93l-2.494 6.722H49a1.014 1.014 0 0 1 .924 1.624zM41 44.22c-2.71 1.886-7.687 2.882-12.468 2.882-4.816 0-9.837-1.009-12.533-2.924V48c0 1.664 4.768 3.978 12.533 3.978C36.028 51.978 41 49.276 41 47.49zM43.065 40.95c0 .187-.032.367-.064.546v5.993C43 51.08 36.51 54 28.533 54c-6.903 0-13.871-1.889-14.473-5.5H14V30.304 16.151h.001C14 12.155 21.488 10 28.533 10c3.94 0 7.73.64 10.396 1.756l-.765 1.868c-2.432-1.019-5.943-1.602-9.631-1.602C20.769 12.022 16 14.427 16 16.151c0 1.725 4.769 4.13 12.533 4.13.195 0 .399 0 .596-.008l.078 2.02a20.96 20.96 0 0 1-.674.009c-4.817 0-9.837-1.009-12.533-2.923v4.358l.001.017c.005.53.489 1.143 1.364 1.72 1.982 1.287 5.55 2.168 9.539 2.35l-.091 2.02c-4.126-.189-7.75-1.067-10.086-2.416-.31.298-.727 1.056-.727 1.466 0 1.725 4.769 4.13 12.533 4.13.738 0 1.465-.025 2.162-.075l.141 2.017a31.44 31.44 0 0 1-2.303.08c-4.817 0-9.837-1.009-12.533-2.923v3.67l.001.017c.005.547.489 1.16 1.364 1.736 2.268 1.475 6.549 2.394 11.168 2.394h.33v2.022h-.33c-4.778 0-9.86-1.008-12.532-2.543-.322.298-.001 1.011-.001 1.548 0 1.725 4.769 4.13 12.533 4.13 7.765 0 12.532-2.405 12.532-4.13 0-.61-.599-1.174-1.092-1.538.41-.247.86-.483 1.373-.7 1.192 1.04 1.483 2.077 1.483 2.816zm-25.923 7.438c.79.408 1.715.772 2.751 1.08l.564-1.939c-.916-.272-1.726-.59-2.406-.941zm2.752-11.05.564-1.939c-.916-.273-1.726-.589-2.406-.94l-.91 1.799c.79.41 1.715.773 2.752 1.08zm-2.752-13.21.91-1.8c.68.352 1.49.669 2.406.942l-.564 1.94a12.045 12.045 0 0 1-2.752-1.082z"
    />
  </svg>,
);

const kyselyIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 24 24" role="img">
    <title>Kysely</title>
    <path
      fill="currentColor"
      d="M4 3.5h3.25v6.2L13.1 3.5H17l-6.15 7.25L17.35 20.5h-4.02l-4.98-7.4-1.1 1.26v6.14H4z"
    />
  </svg>,
);

const mikroormIcon = icon(
  <svg aria-hidden="true" viewBox="1637 0 441 461" role="img">
    <title>MikroORM</title>
    <path
      fill="currentColor"
      d="M1857.682 0c-121.265 0-219.92 55.759-219.92 124.287 0 13.732 4.016 26.941 11.332 39.297a95.826 95.826 0 0 0 3.627 5.677 131.285 131.285 0 0 0 3.814 5.206c15.311 19.522 39.23 36.417 69.074 49.126a253.465 253.465 0 0 0 8.601 3.493 306.503 306.503 0 0 0 9.125 3.328c33.344 11.511 72.492 18.16 114.347 18.16 41.839 0 80.995-6.649 114.339-18.16a316.74 316.74 0 0 0 9.124-3.328 261.755 261.755 0 0 0 8.601-3.493c29.838-12.708 53.757-29.604 69.06-49.126a107.24 107.24 0 0 0 3.83-5.206 99.8 99.8 0 0 0 3.628-5.669c7.32-12.364 11.329-25.572 11.329-39.305C2077.592 55.759 1978.939 0 1857.682 0zm114.616 145.88a53.535 53.535 0 0 1-1.997 3.126 57.159 57.159 0 0 1-2.097 2.857c-8.414 10.718-21.563 20.007-37.941 26.986a142.574 142.574 0 0 1-4.743 1.922 173.019 173.019 0 0 1-5.003 1.84c-18.324 6.313-39.844 9.978-62.835 9.978-22.992 0-44.512-3.665-62.836-9.978a180.965 180.965 0 0 1-5.019-1.84 134.639 134.639 0 0 1-4.72-1.922c-16.395-6.979-29.537-16.268-37.958-26.986a70.948 70.948 0 0 1-2.095-2.857 52.167 52.167 0 0 1-1.989-3.126c-4.024-6.799-6.238-14.039-6.238-21.593 0-37.659 54.212-68.303 120.854-68.303s120.847 30.644 120.847 68.303c0 7.554-2.208 14.794-6.23 21.593z"
    />
    <path
      fill="currentColor"
      fillOpacity="0.7"
      d="M2066.263 185.334c-11.385 13.53-26.591 25.976-45.4 36.844-5.027 2.902-10.264 5.632-15.655 8.235a268.611 268.611 0 0 1-7.601 3.493 322.519 322.519 0 0 1-7.861 3.328c-38.504 15.61-84.188 24.054-132.063 24.054-47.892 0-93.562-8.444-132.073-24.054a311.849 311.849 0 0 1-7.869-3.328 279.229 279.229 0 0 1-7.599-3.493c-5.385-2.603-10.621-5.333-15.64-8.235-18.826-10.868-34.039-23.313-45.408-36.844-7.315 12.378-11.332 25.572-11.332 39.312 0 16.215 5.587 31.72 15.624 45.931a126.84 126.84 0 0 0 3.95 5.236 131.462 131.462 0 0 0 4.054 4.779c36.291 40.494 110.622 68.333 196.292 68.333 85.655 0 159.986-27.839 196.284-68.333a119.467 119.467 0 0 0 4.047-4.779 112.103 112.103 0 0 0 3.939-5.229c10.053-14.219 15.64-29.708 15.64-45.939 0-13.739-4.009-26.94-11.329-39.311z"
    />
  </svg>,
);

const edgedbIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 180 180" role="img">
    <title>Gel</title>
    <path
      fill="currentColor"
      d="M55 66.042C55 88.75 73.091 107.083 95.5 107.083c22.203 0 40.5-18.333 40.5-41.041C136 43.542 117.703 25 95.5 25 73.091 25 55 43.542 55 66.042Zm10.69 61.458C67.336 141.875 79.053 155 95.5 155c16.241 0 28.371-13.125 30.015-27.5 2.262-20.833-16.446-13.958-30.015-13.958-13.568 0-32.071-6.875-29.81 13.958Z"
    />
  </svg>,
);

const redisIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 354 472" role="img">
    <title>Upstash Redis</title>
    <path
      fill="#10B981"
      d="M0.422 412.975c78.105 78.104 204.738 78.104 282.843 0 78.105-78.105 78.105-204.738 0-282.843l-35.356 35.355c58.579 58.579 58.579 153.554 0 212.132-58.578 58.579-153.554 58.579-212.132 0z"
    />
    <path
      fill="#10B981"
      d="M71.133 342.264c39.052 39.052 102.369 39.052 141.421 0 39.052-39.052 39.052-102.369 0-141.421L177.2 236.198c19.526 19.526 19.526 51.184 0 70.711-19.527 19.526-51.185 19.526-70.711 0z"
    />
    <path
      fill="#6EE7B7"
      d="M353.974 59.421c-78.105-78.104-204.738-78.104-282.843 0-78.105 78.105-78.105 204.738 0 282.843l35.355-35.355c-58.578-58.579-58.578-153.554 0-212.132 58.579-58.579 153.554-58.579 212.132 0z"
    />
    <path
      fill="#6EE7B7"
      d="M283.264 130.132c-39.052-39.052-102.369-39.052-141.422 0-39.052 39.053-39.052 102.369 0 141.421l35.355-35.355c-19.526-19.526-19.526-51.184 0-70.711 19.527-19.526 51.185-19.526 70.711 0z"
    />
  </svg>,
);

export default defineDocs({
  entry: "docs",
  theme: pixelBorder({
    ui: {
      colors: {
        primary: "#d9f3ff",
        background: "#050505",
        muted: "#101113",
        border: "#23252a",
      },
      sidebar: { style: "floating" },
      layout: {
        contentWidth: 920,
        sidebarWidth: 296,
        toc: { enabled: true, depth: 3, style: "directional" },
      },
      typography: {
        font: {
          // h1: { size: "2.8rem", weight: 700, letterSpacing: "-0.05em" },
          // h2: { size: "1.72rem", weight: 600, letterSpacing: "-0.035em" },
          // h3: { size: "1.18rem", weight: 600 },
          // body: { size: "1rem", lineHeight: "1.8" },
        },
      },
    },
  }),
  nav: {
    title: (
      <div className="flex items-center gap-3 font-medium tracking-tight text-white">
        <div className="flex -mb-1 items-center gap-2">
          <span className="font-mono text-[11px] uppercase text-white/55">
            <code>@farming-labs/orm</code>
          </span>
        </div>
      </div>
    ),
    url: "/",
  },
  github: {
    url: "https://github.com/farming-labs/orm",
    directory: "website",
  },
  metadata: {
    titleTemplate: "%s - Farming Labs ORM",
    description:
      "Unified schema, generator-first tooling, and pixel-border documentation for @farming-labs/orm",
  },
  og: {
    enabled: true,
    type: "dynamic",
    endpoint: "/api/og",
  },
  feedback: {
    enabled: true,
    onFeedback: submitDocsFeedback,
  },
  breadcrumb: { enabled: true },
  pageActions: {
    // position: "above-title",
    alignment: "right",
    copyMarkdown: { enabled: true },
    openDocs: {
      enabled: true,
      providers: [
        {
          name: "GitHub",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          ),
          urlTemplate: "{githubUrl}",
        },
        {
          name: "ChatGPT",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4092-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0974-2.3616l2.603-1.5018 2.6032 1.5018v3.0036l-2.6032 1.5018-2.603-1.5018z" />
            </svg>
          ),
          urlTemplate: "https://chatgpt.com/?q=Read+this+documentation:+{url}",
        },
        {
          name: "Claude",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.709 15.955l4.397-10.985c.245-.648.245-.648.9-.648h2.756c.649 0 .649 0 .9.648l4.397 10.985c.232.569.232.569-.363.569h-2.392c-.636 0-.636 0-.874-.648l-.706-1.865H8.276l-.706 1.865c-.238.648-.238.648-.874.648H4.709c.245-.648-.363-.569-.363-.569z" />
              <path d="M15.045 6.891L12.289 0H14.61c.655 0 .655 0 .9.648l4.398 10.985c.231.569.231.569-.364.569h-2.391c-.637 0-.637 0-.875-.648z" />
            </svg>
          ),
          urlTemplate: "https://claude.ai/new?q=Read+this+documentation:+{url}",
        },
        {
          name: "Cursor",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          ),
          urlTemplate: "https://cursor.com/link/prompt?text=Read+this+documentation:+{url}",
        },
      ],
    },
  },
  ordering: [
    { slug: "getting-started" },
    {
      slug: "schema",
      children: [{ slug: "fields" }, { slug: "relations" }],
    },
    {
      slug: "runtime",
      children: [{ slug: "query-api" }, { slug: "runtime-helpers" }, { slug: "memory-driver" }],
    },
    { slug: "cli" },
    {
      slug: "integrations",
      children: [
        { slug: "support-matrix" },
        { slug: "prisma" },
        { slug: "drizzle" },
        { slug: "kysely" },
        { slug: "mikroorm" },
        { slug: "typeorm" },
        { slug: "sequelize" },
        { slug: "sql-databases" },
        { slug: "edgedb" },
        { slug: "cloudflare-d1" },
        { slug: "cloudflare-kv" },
        { slug: "redis" },
        { slug: "supabase" },
        { slug: "firestore" },
        { slug: "dynamodb" },
        { slug: "unstorage" },
        { slug: "mongodb" },
      ],
    },
    {
      slug: "use-cases",
      children: [
        { slug: "framework-authors" },
        { slug: "auth-libraries" },
        { slug: "auth-adapter-ecosystem" },
        { slug: "billing-modules" },
        { slug: "fullstack-frameworks" },
        { slug: "internal-platforms" },
      ],
    },
  ],
  themeToggle: { enabled: false },
  icons: {
    book: icon(<BookOpen strokeWidth={1.5} />),
    rocket: icon(<Rocket strokeWidth={1.5} />),
    database: icon(<Database strokeWidth={1.5} />),
    braces: icon(<Braces strokeWidth={1.5} />),
    network: icon(<Network strokeWidth={1.5} />),
    server: icon(<Server strokeWidth={1.5} />),
    boxes: icon(<Boxes strokeWidth={1.5} />),
    code: icon(<Code2 strokeWidth={1.5} />),
    package: icon(<Package strokeWidth={1.5} />),
    filecode: icon(<FileCode2 strokeWidth={1.5} />),
    prisma: brandIcon(siPrisma.path, siPrisma.title),
    drizzle: brandIcon(siDrizzle.path, siDrizzle.title),
    kysely: kyselyIcon,
    mikroorm: mikroormIcon,
    edgedb: edgedbIcon,
    typeorm: brandIcon(siTypeorm.path, siTypeorm.title),
    sequelize: brandIcon(siSequelize.path, siSequelize.title),
    cloudflare: brandIcon(siCloudflare.path, siCloudflare.title),
    redis: redisIcon,
    mongodb: brandIcon(siMongodb.path, siMongodb.title),
    supabase: brandIcon(siSupabase.path, siSupabase.title),
    firestore: brandIcon(siFirebase.path, siFirebase.title),
    dynamodb: dynamodbIcon,
    unstorage: brandIcon(siUnjs.path, siUnjs.title),
    harddrive: icon(<HardDrive strokeWidth={1.5} />),
    terminal: icon(<Terminal strokeWidth={1.5} />),
    users: icon(<Users strokeWidth={1.5} />),
    shield: icon(<ShieldCheck strokeWidth={1.5} />),
    card: icon(<CreditCard strokeWidth={1.5} />),
    building: icon(<Building2 strokeWidth={1.5} />),
    pin: icon(<Pin strokeWidth={1.5} />),
  },
  sidebar: {
    banner: (
      <div
        className="-mx-4 relative mt-2"
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-fd-border)",
          borderTop: "1px solid var(--color-fd-border)",
          fontSize: "13px",
          color: "var(--color-fd-muted-foreground)",
          backgroundImage:
            "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-fd-border) 2%, transparent), color-mix(in srgb, var(--color-fd-foreground) 7%, transparent) 1px, transparent 1px, transparent 6px)",
        }}
      >
        <div
          className="font-mono tracking-tighter"
          style={{ fontWeight: 600, marginBottom: 4, color: "var(--color-fd-foreground)" }}
        >
          <span style={{ opacity: 0.4 }}>
            <Pin size={12} className="inline-flex" />{" "}
          </span>
          <a
            href={`/changelogs#${latestChangelogEntry.anchor}`}
            className="lowercase cursor-pointer text-[12px] underline underline-offset-2 decoration-dotted transition-colors mr-1"
            style={{
              textDecorationColor:
                "color-mix(in srgb, var(--color-fd-foreground) 30%, transparent)",
            }}
          >
            {latestChangelogEntry.version}
          </a>
        </div>
        <span className="uppercase font-mono text-[9.5px] tracking-tight block">
          Read the latest release notes and runtime changes in the changelog.
        </span>
      </div>
    ),

    footer: (
      <div
        className="-mx-4 -my-2 -mb-4 flex flex-col gap-1 font-mono uppercase"
        style={{
          padding: "9px 16px",
          fontSize: "12px",
          backgroundImage:
            "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-fd-border) 7%, transparent), color-mix(in srgb, var(--color-fd-foreground) 5%, transparent) 1px, transparent 1px, transparent 6px)",
        }}
      >
        <div className="docs-sidebar-footer mb-2">
          <a href="/">Home</a>
          <a href="/docs/getting-started">Setup</a>
          <a href="/docs/runtime">Runtime</a>
          <a href="/docs/integrations">Integrations</a>
          <a href="/docs/use-cases">Use cases</a>
          <a href="/docs/cli">CLI</a>
          <a href="/docs/schema">Schema</a>
          <a href="/docs/relations">Relations</a>
        </div>
        <div className="docs-sidebar-credit-row text-white/80 opacity-80 flex border-t border-white/10 pb-1 pt-2 -mx-4 gap-2 items-center justify-center text-[10px] font-light font-mono uppercase">
          <Package size={14} className="inline-flex mb-px shrink-0" />
          <span>
            Built with{" "}
            <a
              href="https://github.com/farming-labs"
              target="_blank"
              rel="noreferrer"
              className="docs-sidebar-credit-link transition-colors"
            >
              @farming-labs
            </a>
          </span>
        </div>
      </div>
    ),
  },
});
