import Link from "next/link";
import BeamBackground from "@/components/ui/beam-background";
import { PatternText } from "@/components/ui/pattern-text";
import { cn } from "@/lib/utils";

const bottomLink =
  "font-mono text-[0.8rem] font-medium uppercase tracking-[0.12em] text-slate-400 transition-colors duration-200 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/35";

const GITHUB_URL = "https://github.com/farming-labs/orms";

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
        <div className="pointer-events-none absolute inset-0 opacity-[0.92]" aria-hidden="true">
          <BeamBackground
            beamWidth={1.05}
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

        <div className="relative z-2 flex min-h-0 w-full flex-1 flex-col">
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col justify-center py-[clamp(24px,5vh,56px)]",
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
              <p className="m-0 max-w-[min(32rem,100%)] font-mono text-lg font-light uppercase tracking-tight text-white/70">
                Define the data model once, then generate the storage layer each app stack wants along with
                built-in cli.
              </p>
            </div>

            <hr
              className="relative z-2 mt-2 mb-0 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] block h-px w-screen max-w-[100vw] shrink-0 border-0 bg-white/12"
              aria-hidden
            />

            <div
              className={cn(
                "relative z-2 box-border w-screen max-w-[100vw] px-[clamp(20px,6vw,72px)] pb-0 pt-5",
                "ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]",
              )}
            >
              <div
                className={cn(
                  "grid w-full grid-cols-4 -mt-5 gap-px border border-t-0 border-b-0 border-white/[0.08] bg-white/20 backdrop-blur-md",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.28)]",
                  "max-[960px]:grid-cols-2 max-[480px]:grid-cols-1",
                )}
                aria-label="Features"
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
            </div>

            <hr
              className="relative z-2 mt-0 mb-0 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] block h-px w-screen max-w-[100vw] shrink-0 border-0 bg-white/12"
              aria-hidden
            />
          </div>

          <nav
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-start gap-x-12 gap-y-3 px-[clamp(20px,6vw,72px)] pb-[max(28px,4vh)] pt-6",
              "max-md:gap-x-10 max-md:px-5 max-md:pb-8",
            )}
            aria-label="Site links"
          >
            <Link href="/docs" className={bottomLink}>
              [ DOCS ]
            </Link>
            <a
              href={GITHUB_URL}
              className={bottomLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              [ GITHUB ]
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}
