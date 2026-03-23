import { defineDocs } from "@farming-labs/docs";
import { pixelBorder } from "@farming-labs/theme/pixel-border";

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
  ordering: "numeric",
  themeToggle: { enabled: false },
  sidebar: {
    banner: (
      <div className="docs-sidebar-banner">
        <strong>Source of truth</strong>
        <p>
          Define the schema once in <code>@farming-labs/orm</code>, then let generation and docs
          orbit the same contract.
        </p>
      </div>
    ),
    footer: (
      <div className="docs-sidebar-footer">
        <a href="/">Home</a>
        <a href="/docs/getting-started">Setup</a>
        <a href="/docs/use-cases">Use cases</a>
      </div>
    ),
  },
});
