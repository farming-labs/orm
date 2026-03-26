import Link from "next/link";
import { CliShowcase } from "@/components/home/cli-showcase";
import BeamBackground from "@/components/ui/beam-background";
import { PatternText } from "@/components/ui/pattern-text";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/farming-labs/orm";

const footerNavTransition =
  "duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0";

const iconClass = cn(
  "size-3.5 shrink-0 opacity-55 transition-opacity",
  footerNavTransition,
  "group-hover:opacity-90 group-focus-visible:opacity-90",
);

function FooterNavLabel({ text }: { text: string }) {
  return (
    <span
      className={cn(
        "underline decoration-dotted decoration-from-font underline-offset-[7px]",
        "decoration-transparent [text-decoration-skip-ink:none]",
        "transition-[text-decoration-color,text-underline-offset]",
        footerNavTransition,
        "group-hover:decoration-slate-200/85 group-hover:underline-offset-[9px]",
        "group-focus-visible:decoration-slate-200/85 group-focus-visible:underline-offset-[9px]",
      )}
    >
      <span className="inline-flex items-baseline">
        <span
          className={cn(
            "text-[1.2em] font-medium leading-none tracking-tight text-current",
            "opacity-40 transition-opacity",
            footerNavTransition,
            "group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          [
        </span>
        <span className={cn("px-[0.3em] transition-colors", footerNavTransition)}>{text}</span>
        <span
          className={cn(
            "text-[1.2em] font-medium leading-none tracking-tight text-current",
            "opacity-40 transition-opacity",
            footerNavTransition,
            "group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          ]
        </span>
      </span>
    </span>
  );
}

function IconUseCases({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function IconInstall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDocs({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M8 7h8M8 11h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconGithub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const footerLinkClass = cn(
  "group font-mono text-[0.72rem] font-light uppercase tracking-tight text-slate-400/55",
  "inline-flex min-h-10 items-center gap-1.5 py-1.5 transition-colors",
  footerNavTransition,
  "hover:text-slate-100/92 sm:min-h-0 sm:py-0",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/35",
);

const heroFeatureCards = [
  {
    title: "Schema & relations",
    body: "Model fields, references, and defaults in one TypeScript contract your app and generators both read from.",
    href: "/docs/schema",
  },
  {
    title: "CLI: prisma, drizzle, sql",
    body: "One config points at your schemas; the CLI writes Prisma, Drizzle, or SQL files so teams keep their usual stack.",
    href: "/docs/cli",
  },
  {
    title: "Install & wire up",
    body: "Add the packages, drop a farm-orm config, and map each target to an output path—docs walk the full setup.",
    href: "/docs/getting-started",
  },
  {
    title: "Who it’s for",
    body: "Auth and billing libraries, internal platforms, and any kit that needs one schema story across many ORMs.",
    href: "/docs/use-cases",
  },
] as const;

export default function HomePage() {
  return (
    <main className="relative min-h-svh overflow-x-clip bg-[#050507] text-slate-50">
      <section
        className={cn(
          "relative isolate z-10 flex min-h-svh w-full flex-col bg-[#050507]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_30px_80px_rgba(0,0,0,0.28)]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-8 z-[3] hidden w-px bg-white/12 sm:block"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-8 z-[3] hidden w-px bg-white/12 sm:block"
          aria-hidden
        />

        <div className="pointer-events-none absolute inset-0 opacity-[0.45]" aria-hidden="true">
          <BeamBackground
            beamWidth={1.05}
            beamHeight={24}
            beamNumber={16}
            lightColor="#ffffff"
            speed={1.6}
            noiseIntensity={0.11}
            scale={0.2}
            rotation={0}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 bg-[rgba(4,4,6,0.42)]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[clamp(4.5rem,16vw,12rem)] bg-gradient-to-r from-[#050507] via-[#050507]/85 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[clamp(4.5rem,16vw,12rem)] bg-gradient-to-l from-[#050507] via-[#050507]/85 to-transparent"
        />

        <div className="relative z-2 flex min-h-0 w-full flex-1 flex-col">
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col justify-start py-[clamp(20px,4vh,48px)] sm:justify-center sm:py-[clamp(24px,5vh,56px)]",
            )}
          >
            <div
              className={cn(
                "flex w-full max-w-full flex-col items-start gap-5 self-start px-[clamp(20px,6vw,72px)] pb-6 text-left",
                "max-md:px-5 max-md:pb-5",
              )}
            >
              <h1 className="mb-0 flex max-w-[min(32rem,100%)] flex-col items-start gap-[0.12em] leading-[1.05] text-balance">
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
              <p className="m-0 max-w-[min(32rem,100%)] font-mono text-[0.8125rem] font-light uppercase leading-snug tracking-tight text-white/70 sm:text-sm">
                Define the data model once, then generate the storage layer each app stack wants
                along with built-in cli.
              </p>
            </div>

            <hr
              className="relative z-2 mt-2 mb-0 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] block h-px w-screen max-w-[100vw] shrink-0 border-0 bg-white/12"
              aria-hidden
            />

            <div
              className={cn(
                "relative z-2 box-border w-screen max-w-[100vw] pb-0",
                "ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]",
              )}
            >
              <div
                aria-hidden
                className="home-hero-gutter-pattern pointer-events-none absolute inset-y-0 z-0"
                style={{
                  left: "calc(1.25rem + 13px)",
                  width: "max(0px, calc(clamp(20px, 6vw, 72px) - 1.25rem - 1px))",
                }}
              />
              <div
                aria-hidden
                className="home-hero-gutter-pattern pointer-events-none absolute inset-y-0 z-0"
                style={{
                  right: "calc(1.25rem + 13px)",
                  width: "max(0px, calc(clamp(20px, 6vw, 72px) - 1.25rem - 1px))",
                }}
              />
              <div className="relative z-[1] px-[clamp(20px,6vw,72px)] pb-0 pt-5">
                <div
                  className={cn(
                    "relative -mt-5 flex w-full min-w-0",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.28)]",
                  )}
                  aria-label="Features"
                >
                  <div className="w-px shrink-0 self-stretch bg-white/12" aria-hidden />
                  <div
                    className={cn(
                      "grid min-w-0 flex-1 grid-cols-4 gap-px bg-white/12 backdrop-blur-md",
                      "max-[960px]:grid-cols-2 max-[480px]:grid-cols-1",
                    )}
                  >
                    {heroFeatureCards.map((card) => (
                      <Link
                        key={card.href}
                        href={card.href}
                        className={cn(
                          "group flex min-h-[min(11rem,28vw)] min-w-0 flex-col items-start justify-center bg-[rgba(10,10,12,0.92)] px-5 py-7 text-left transition-colors duration-150",
                          "hover:bg-[rgba(14,14,16,0.96)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/35",
                          "max-md:min-h-0 max-md:py-6",
                        )}
                      >
                        <h3
                          className={cn(
                            "mb-2 mt-0 font-mono text-[clamp(0.78rem,1.15vw,0.9rem)] font-medium uppercase leading-snug tracking-[0.06em] text-slate-200",
                            "underline decoration-dotted decoration-from-font underline-offset-[6px]",
                            "decoration-transparent [text-decoration-skip-ink:none]",
                            "transition-[text-decoration-color,text-underline-offset] duration-300 ease-out",
                            "group-hover:decoration-slate-200/85 group-hover:underline-offset-[7px]",
                            "group-focus-visible:decoration-slate-200/85 group-focus-visible:underline-offset-[7px]",
                          )}
                        >
                          {card.title}
                        </h3>
                        <p
                          className={cn(
                            "m-0 text-left text-[clamp(0.84rem,1.05vw,0.95rem)] leading-relaxed text-slate-300/90",
                          )}
                        >
                          {card.body}
                        </p>
                      </Link>
                    ))}
                  </div>
                  <div className="w-px shrink-0 self-stretch bg-white/12" aria-hidden />
                </div>
              </div>
            </div>

            <hr
              className="relative z-2 mt-0 mb-0 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] block h-px w-screen max-w-[100vw] shrink-0 border-0 bg-white/12"
              aria-hidden
            />
          </div>

          <hr
            className="relative z-2 mt-0 mb-0 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] block h-px w-screen max-w-[100vw] shrink-0 border-0 bg-white/12"
            aria-hidden
          />
          <div
            className={cn(
              "relative z-2 shrink-0 px-[clamp(20px,6vw,72px)] pb-2 pt-5",
              "max-md:px-5 max-md:pb-3 max-md:pt-4",
            )}
          >
            <CliShowcase />
          </div>
          <hr
            className="relative z-2 mt-0 mb-0 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] block h-px w-screen max-w-[100vw] shrink-0 border-0 bg-white/12"
            aria-hidden
          />
          <nav
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-between gap-x-8 gap-y-4 px-[clamp(20px,6vw,72px)] pb-[max(28px,4vh)] pt-5",
              "max-md:px-5 max-md:pb-8",
            )}
            aria-label="Site links"
          >
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Link href="/docs" className={footerLinkClass}>
                <IconDocs className={iconClass} />
                <FooterNavLabel text="DOCS" />
              </Link>

              <Link href="/docs/getting-started" className={footerLinkClass}>
                <IconInstall className={iconClass} />
                <FooterNavLabel text="INSTALL" />
              </Link>
              <Link href="/docs/use-cases" className={footerLinkClass}>
                <IconUseCases className={iconClass} />
                <FooterNavLabel text="USE CASES" />
              </Link>
            </div>
            <a
              href={GITHUB_URL}
              className={footerLinkClass}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconGithub className={iconClass} />
              <FooterNavLabel text="GITHUB" />
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}
