import type { ReactNode } from "react";
import { defineDocs } from "@farming-labs/docs";
import { pixelBorder } from "@farming-labs/theme/pixel-border";
import { siDrizzle, siMongodb, siPrisma } from "simple-icons";
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
} from "lucide-react";

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
          h1: { size: "2.8rem", weight: 700, letterSpacing: "-0.05em" },
          h2: { size: "1.72rem", weight: 600, letterSpacing: "-0.035em" },
          h3: { size: "1.18rem", weight: 600 },
          body: { size: "1rem", lineHeight: "1.8" },
        },
      },
    },
  }),
  nav: {
    title: (
      <div className="flex items-center gap-3 font-medium tracking-tight text-white">
        <span className="h-2.5 w-2.5 rounded-sm bg-cyan-100 shadow-[0_0_20px_rgba(125,211,252,0.35)]" />
        <div className="flex items-center gap-2">
          <span>Farming Labs ORM</span>
          <span className="border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] uppercase text-white/55">
            docs
          </span>
        </div>
      </div>
    ),
    url: "/",
  },
  metadata: {
    titleTemplate: "%s - Farming Labs ORM",
    description:
      "Unified schema, generator-first tooling, and pixel-border documentation for Farming Labs ORM.",
  },
  breadcrumb: { enabled: true },
  ordering: [
    { slug: "getting-started" },
    {
      slug: "schema",
      children: [{ slug: "fields" }, { slug: "relations" }],
    },
    {
      slug: "runtime",
      children: [{ slug: "query-api" }, { slug: "memory-driver" }],
    },
    { slug: "cli" },
    {
      slug: "integrations",
      children: [
        { slug: "prisma" },
        { slug: "drizzle" },
        { slug: "kysely" },
        { slug: "sql-databases" },
        { slug: "mongodb" },
      ],
    },
    {
      slug: "use-cases",
      children: [
        { slug: "auth-libraries" },
        { slug: "billing-modules" },
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
    mongodb: brandIcon(siMongodb.path, siMongodb.title),
    harddrive: icon(<HardDrive strokeWidth={1.5} />),
    terminal: icon(<Terminal strokeWidth={1.5} />),
    users: icon(<Users strokeWidth={1.5} />),
    shield: icon(<ShieldCheck strokeWidth={1.5} />),
    card: icon(<CreditCard strokeWidth={1.5} />),
    building: icon(<Building2 strokeWidth={1.5} />),
  },
  sidebar: {
    // banner: (
    // <div className="docs-sidebar-banner">
    //   <strong>Source of truth</strong>
    //   <p>
    //     Define the schema once in <code>@farming-labs/orm</code>, then let generation and docs
    //     orbit the same contract.
    //   </p>
    // </div>
    // ),
    footer: (
      <div className="docs-sidebar-footer">
        <a href="/">Home</a>
        <a href="/docs/getting-started">Setup</a>
        <a href="/docs/runtime">Runtime</a>
        <a href="/docs/integrations">Integrations</a>
        <a href="/docs/use-cases">Use cases</a>
      </div>
    ),
  },
});
