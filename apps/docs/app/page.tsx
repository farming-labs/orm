import Link from "next/link";
import BeamBackground from "@/components/ui/beam-background";
import { PatternText } from "@/components/ui/pattern-text";
import { cn } from "@/lib/utils";

const panel =
  "rounded-none border border-white/[0.08] bg-[rgba(12,12,14,0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.28)]";

const sectionShell =
  "relative z-10 mx-auto grid w-[min(1380px,calc(100%-clamp(40px,6vw,120px)))] max-w-full gap-7 pt-[104px]";

const sectionTopRule =
  "before:pointer-events-none before:absolute before:top-0 before:left-1/2 before:h-px before:w-screen before:-translate-x-1/2 before:bg-white/12";

const btnBase =
  "inline-flex min-h-[46px] items-center justify-center rounded-none px-[18px] font-bold transition duration-150 ease-out hover:-translate-y-px max-md:w-full";

const btnPrimary =
  `${btnBase} border border-dashed border-white/[0.22] bg-white/[0.06] text-slate-50 shadow-none`;

const btnSecondary =
  `${btnBase} border border-white/10 bg-white/[0.03] text-slate-100`;

const toneBorder: Record<string, string> = {
  cyan: "border-dashed border-sky-300/30",
  emerald: "border-dashed border-emerald-300/30",
  violet: "border-dashed border-violet-300/30",
};

const statusTone: Record<string, string> = {
  live: "bg-white/[0.04] text-slate-50",
  next: "bg-white/[0.04] text-slate-200",
  future: "bg-white/[0.04] text-slate-300/70",
};

const platformCards = [
  {
    label: "Core contract",
    title: "Define the data model once.",
    body: "Fields, relations, defaults, and references live in one product surface instead of spreading across adapter-specific implementations.",
    tone: "cyan" as const,
  },
  {
    label: "App outputs",
    title: "Generate the stack each app already uses.",
    body: "Turn the same schema into Prisma, Drizzle, or safe SQL artifacts so consumers can meet your package in their own environment.",
    tone: "emerald" as const,
  },
  {
    label: "Product docs",
    title: "Keep the story aligned with the implementation.",
    body: "Landing page, docs, CLI, demo, and workspace tests all reinforce the same system instead of drifting apart.",
    tone: "violet" as const,
  },
];

const featureCards = [
  {
    title: "Schema as the interface",
    body: "Treat the schema as the stable contract your library exposes to apps, runtimes, and generators.",
  },
  {
    title: "Generator-first workflow",
    body: "Point the CLI at exported schemas and emit target-specific artifacts without maintaining a parallel hand-written setup.",
  },
  {
    title: "Runtime packages next",
    body: "Keep the contract clean now so Prisma, Drizzle, Kysely, SQL, and Mongoose packages can layer in later without redesign.",
  },
  {
    title: "Honest support matrix",
    body: "This repo stays explicit about what is already live and what is still planned, even as the product surface gets sharper.",
  },
];

const useCases = [
  {
    title: "Auth libraries",
    body: "Ship one schema contract for users, sessions, accounts, memberships, and plugins instead of one adapter per ORM.",
  },
  {
    title: "Billing modules",
    body: "Model plans, invoices, seats, credits, and audit trails once, then generate the storage layer each consumer wants.",
  },
  {
    title: "Internal platform kits",
    body: "Centralize shared schemas across many apps and let each team bind them to the persistence layer they already trust.",
  },
];

const supportRows = [
  { label: "Schema core", value: "Live", tone: "live" as const },
  { label: "CLI generation", value: "Live", tone: "live" as const },
  { label: "Memory runtime", value: "Live", tone: "live" as const },
  { label: "Prisma runtime package", value: "Next", tone: "next" as const },
  { label: "Drizzle runtime package", value: "Next", tone: "next" as const },
  { label: "Kysely runtime package", value: "Next", tone: "next" as const },
  { label: "Direct SQL package", value: "Future", tone: "future" as const },
  { label: "Mongoose package", value: "Future", tone: "future" as const },
];

const kicker =
  "inline-flex w-fit border border-dashed border-white/[0.18] bg-white/[0.02] px-3 py-2 font-mono text-[0.8rem] tracking-wide text-slate-300/80";

const sectionTitle =
  "m-0 text-balance text-[clamp(2rem,3vw,3.15rem)] font-normal leading-[1.02] tracking-tight";

const sectionText = "m-0 leading-[1.8] text-slate-300/80";

const cardLabel =
  "font-mono text-[0.76rem] uppercase tracking-[0.06em] text-slate-200";

const heading3 =
  "my-2.5 text-xl font-normal leading-snug tracking-tight first:mt-0";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip overflow-y-visible bg-[#050507] pb-[104px] text-slate-50 max-md:pb-[58px]">
      <div className="pointer-events-none absolute inset-0 bg-transparent" aria-hidden />

      <section
        className={cn(
          "relative isolate z-10 flex min-h-[100svh] w-full flex-col items-stretch justify-center overflow-visible bg-[#050507] py-[max(112px,14vh)] pb-[max(72px,8vh)] pl-[clamp(20px,6vw,72px)] pr-[clamp(20px,6vw,72px)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_30px_80px_rgba(0,0,0,0.28)]",
          "max-md:min-h-[100svh] max-md:py-28 max-md:pb-16 max-md:pl-5 max-md:pr-5",
        )}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.92]" aria-hidden="true">
          <BeamBackground
            beamWidth={2.4}
            beamHeight={24}
            beamNumber={16}
            lightColor="#ffffff"
            speed={1.6}
            noiseIntensity={0.18}
            scale={0.2}
            rotation={0}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 bg-[rgba(4,4,6,0.3)]" />

        <div className="relative z-[2] flex w-full max-w-[min(32rem,100%)] flex-col gap-5 self-start">
          <div className="flex max-w-[min(32rem,100%)] flex-col gap-4">
            <h1 className="mb-[0.2em] flex flex-col items-start gap-[0.12em] leading-[1.05] text-balance">
              <PatternText
                as="span"
                text="One schema."
                className="block text-[clamp(2.25rem,6vw,4.75rem)]! tracking-[-0.08em]"
              />
              <PatternText
                as="span"
                text="Many outputs."
                className="block text-[clamp(2.25rem,6vw,4.75rem)]! tracking-[-0.08em]"
              />
            </h1>
            <p className="font-mono text-lg font-light uppercase tracking-tight text-white/70">
              Define the data model once, then generate the storage layer each
              app stack wants along with built-in cli.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/docs" className={btnPrimary}>
                Explore the docs
              </Link>
              <Link href="/docs/getting-started" className={btnSecondary}>
                Start here
              </Link>
            </div>
          </div>
        </div>

        <hr
          className="relative z-[2] mt-4 mb-0 block h-px w-[100vw] max-w-[100vw] shrink-0 border-0 bg-white/12 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]"
          aria-hidden
        />

        <div
          className={cn(
            "relative z-[2] box-border w-[100vw] max-w-[100vw] px-[clamp(20px,6vw,72px)] pb-0 pt-5",
            "ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]",
          )}
        >
          <div
            className={cn(
              "grid w-full grid-cols-4 gap-px border border-t-0 border-white/[0.08] bg-white/[0.08] backdrop-blur-md",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.28)]",
              "max-[960px]:grid-cols-2 max-[480px]:grid-cols-1",
            )}
            aria-label="Features"
          >
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="min-w-0 bg-[rgba(10,10,12,0.92)] px-3 py-3.5"
              >
                <h3
                  className={cn(
                    "mb-1.5 mt-0 text-[clamp(0.82rem,1.1vw,0.95rem)] font-medium leading-tight tracking-tight",
                  )}
                >
                  {card.title}
                </h3>
                <p
                  className={cn(
                    "m-0 text-[clamp(0.72rem,0.95vw,0.82rem)] leading-[1.55] text-slate-300/80",
                  )}
                >
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className={cn(sectionShell, sectionTopRule)}>
        <div className="grid max-w-[840px] gap-4">
          <span className={kicker}>Platform</span>
          <h2 className={sectionTitle}>
            Built as a system, not a pile of storage-specific glue.
          </h2>
          <p className={sectionText}>
            The point is not to hide complexity with magic. It is to centralize
            the real shared contract so generation, docs, examples, and future
            drivers all line up around the same data model.
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-[18px] max-lg:grid-cols-1">
          {platformCards.map((card) => (
            <article
              key={card.title}
              className={cn(panel, "p-6", toneBorder[card.tone])}
            >
              <span className={cardLabel}>{card.label}</span>
              <h3 className={heading3}>{card.title}</h3>
              <p className={sectionText}>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className={sectionShell}>
        <div className="grid max-w-[840px] gap-4">
          <span className={kicker}>Features</span>
          <h2 className={sectionTitle}>
            A modern product surface for teams shipping reusable packages.
          </h2>
          <p className={sectionText}>
            This works especially well when your package has to meet Prisma
            users, Drizzle users, SQL-first teams, and documentation readers
            without rewriting the same story over and over.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[18px]">
          <article className={cn(panel, "p-6")}>
            <div className="grid gap-4">
              <div className="grid gap-3.5 border border-dashed border-white/[0.14] bg-white/[0.02] p-[18px]">
                <span className={cardLabel}>Unified contract</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-3 w-[58%] rounded-none bg-slate-300" />
                  <span className="inline-flex h-3 w-[28%] rounded-none bg-slate-400" />
                  <span className="inline-flex h-3 w-[14%] rounded-none bg-slate-500" />
                </div>
              </div>
              <div className="grid gap-3.5 border border-dashed border-white/[0.14] bg-white/[0.02] p-[18px]">
                <span className={cardLabel}>Generated outputs</span>
                <div className="flex items-center gap-3">
                  <span className="h-[42px] w-[42px] border border-dashed border-white/[0.14] bg-white/[0.04]" />
                  <span className="h-[42px] w-[42px] border border-dashed border-white/[0.14] bg-white/[0.04]" />
                  <span className="h-[42px] w-[42px] border border-dashed border-white/[0.14] bg-white/[0.04]" />
                </div>
              </div>
              <div className="grid gap-3.5 border border-dashed border-white/[0.14] bg-white/[0.02] p-[18px]">
                <span className={cardLabel}>Runtime path</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-3 w-[30%] rounded-none bg-slate-200" />
                  <span className="inline-flex h-3 w-[46%] rounded-none bg-slate-400" />
                  <span className="inline-flex h-3 w-[24%] rounded-none bg-slate-500" />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="use-cases" className={sectionShell}>
        <div className="grid max-w-[840px] gap-4">
          <span className={kicker}>Use cases</span>
          <h2 className={sectionTitle}>
            A better fit for auth, billing, and platform libraries than ORM-by-ORM
            adapters.
          </h2>
          <p className={sectionText}>
            Reusable packages need a stable storage-facing contract. This is the
            kind of system that keeps that contract intact while still meeting the
            integration needs of downstream apps.
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-[18px] max-lg:grid-cols-1">
          {useCases.map((item) => (
            <article key={item.title} className={cn(panel, "p-6")}>
              <h3 className={heading3}>{item.title}</h3>
              <p className={sectionText}>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={sectionShell}>
        <div className="grid max-w-[840px] gap-4">
          <span className={kicker}>Support matrix</span>
          <h2 className={sectionTitle}>
            Sharp visuals, but still honest about the current implementation.
          </h2>
          <p className={sectionText}>
            The project can look polished without pretending every runtime package
            is already done. The landing page should sell the direction while still
            telling the truth.
          </p>
        </div>

        <div className={cn(panel, "overflow-hidden border-dashed")}>
          {supportRows.map((row) => (
            <article
              key={row.label}
              className="flex items-center justify-between gap-[22px] border-b border-white/[0.08] p-6 last:border-b-0 max-md:flex-col max-md:items-start"
            >
              <div>
                <strong className="mb-1.5 block text-base font-semibold">
                  {row.label}
                </strong>
                <p className={sectionText}>{row.value}</p>
              </div>
              <span
                className={cn(
                  "inline-flex min-w-[78px] items-center justify-center rounded-none border border-dashed border-white/[0.16] px-3 py-2 font-mono text-[0.78rem] uppercase tracking-wider",
                  statusTone[row.tone],
                )}
              >
                {row.value}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section
        className={cn(
          "relative z-10 mx-auto mt-[104px] flex w-[min(1380px,calc(100%-clamp(40px,6vw,120px)))] max-w-full flex-col items-start justify-between gap-[22px] max-md:flex-col",
          panel,
          "p-[30px]",
          "lg:flex-row lg:items-center",
        )}
      >
        <div className="grid gap-4">
          <span className={kicker}>Next step</span>
          <h2 className={sectionTitle}>
            Follow the docs route and the example workflow that this monorepo is
            already testing.
          </h2>
          <p className={sectionText}>
            The homepage sets the tone, then <code className="text-slate-200">/docs</code> carries the
            product forward with `@farming-labs/docs`, the pixel-border theme, and
            the actual generator story underneath.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 max-md:w-full">
          <Link href="/docs" className={btnPrimary}>
            Open documentation
          </Link>
          <Link href="/docs/use-cases" className={btnSecondary}>
            Browse use cases
          </Link>
        </div>
      </section>
    </main>
  );
}
