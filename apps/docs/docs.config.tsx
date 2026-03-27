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
import { submitDocsFeedback } from "./lib/feedback";

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
      "Unified schema, generator-first tooling, and pixel-border documentation for @farming-labs/docs",
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
    banner: (
      <div
        className="-mx-4 h-[40px] border border-white/10 border-x-0 border-b mb-1 border-y-0 -my-2 flex flex-col gap-1 font-mono uppercase"
        style={{
          padding: "9px 16px",
          fontSize: "12px",
          backgroundImage:
            "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-fd-border) 7%, transparent), color-mix(in srgb, var(--color-fd-foreground) 5%, transparent) 1px, transparent 1px, transparent 6px)",
        }}
      ></div>
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
