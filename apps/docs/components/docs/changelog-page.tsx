import Link from "next/link";
import BeamBackground from "@/components/ui/beam-background";
import { changelogEntries, latestChangelogEntry } from "@/lib/changelog";
import { cn } from "@/lib/utils";
import { GitBranch } from "lucide-react";

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
const footerNavTransition =
  "duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0";

const footerLinkClass = cn(
  "group font-mono text-[0.72rem] font-light uppercase tracking-tight text-slate-400/55",
  "inline-flex min-h-10 items-center gap-1.5 py-1.5 transition-colors",
  footerNavTransition,
  "hover:text-slate-100/92 sm:min-h-0 sm:py-0",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/35",
);

const iconClass = cn(
  "size-3.5 shrink-0 opacity-55 transition-opacity",
  footerNavTransition,
  "group-hover:opacity-90 group-focus-visible:opacity-90",
);

export function ChangelogPage() {
  return (
    <div className="not-prose">
      <div className="w-full lg:grid lg:min-h-svh lg:grid-cols-[42vw_58vw]">
        <aside className="lg:min-h-svh lg:border-r lg:border-white/12">
          <div className="lg:sticky lg:top-0 lg:h-svh">
            <section className="relative isolate h-full overflow-hidden border-b border-white/12 bg-[#050507] lg:border-b-0">
              <div className="pointer-events-none absolute inset-y-0 left-8 z-[3] hidden w-px bg-white/12 sm:block" />
              <div className="pointer-events-none absolute inset-y-0 right-8 z-[3] hidden w-px bg-white/12 sm:block" />

              <div
                className="pointer-events-none absolute inset-0 opacity-[0.38]"
                aria-hidden="true"
              >
                <BeamBackground
                  beamWidth={1}
                  beamHeight={20}
                  beamNumber={14}
                  lightColor="#ffffff"
                  speed={1.35}
                  noiseIntensity={0.2}
                  scale={0.2}
                  rotation={0}
                />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[clamp(4.5rem,16vw,12rem)] bg-gradient-to-r from-[#050507] via-[#050507]/85 to-transparent"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[clamp(4.5rem,16vw,12rem)] bg-gradient-to-l from-[#050507] via-[#050507]/85 to-transparent"
              />
              {/* <div
                aria-hidden
                className="home-hero-gutter-pattern pointer-events-none absolute inset-y-0 left-[calc(1.25rem+13px)] z-[1] hidden w-[max(0px,calc(clamp(20px,6vw,72px)-1.25rem-1px))] sm:block"
              />
              
              */}
              <div
                aria-hidden
                className="home-hero-gutter-pattern opacity-55 pointer-events-none absolute inset-y-0 right-[0] z-[1] hidden w-[max(0px,calc(clamp(20px,6vw,72px)-1.25rem-20px))] sm:block"
              />
              <div className="relative z-10 flex h-full min-h-full flex-col justify-between px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
                <div className="flex flex-1 flex-col justify-end">
                  <div className="mt-auto space-y-4 pt-8 sm:space-y-5 sm:pt-12 lg:pb-8 lg:pt-16">
                    <div className="font flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Link href="/docs" className={footerLinkClass}>
                        <IconDocs className={iconClass} />
                        <FooterNavLabel text="DOCS" />
                      </Link>
                      <Link href="/docs" className={cn(footerLinkClass, "mb-0.5 lowercase")}>
                        <GitBranch className={iconClass} />
                        <FooterNavLabel text={latestChangelogEntry.version} />
                      </Link>
                    </div>
                    <h1 className="m-0 text-[clamp(2.8rem,16vw,4rem)] uppercase leading-[0.9] tracking-[-0.07em] text-white sm:text-[clamp(3.25rem,11vw,4.2rem)] lg:text-[4rem] lg:leading-[0.92] lg:tracking-[-0.08em]">
                      Changelogs
                    </h1>
                    <p className="m-0 max-w-md text-[0.92rem] leading-6 text-slate-300/84 sm:text-[0.96rem] sm:leading-7 lg:max-w-full lg:text-[clamp(0.95rem,1.15vw,1.08rem)] lg:leading-7">
                      <span className="font-mono text-[0.68rem] uppercase tracking-tighter text-white/60 sm:text-xs">
                        Track the latest updates, bug fixes, and improvements for{" "}
                      </span>
                      <code className="font-mono text-[0.78rem] leading-6 text-white sm:text-xs sm:leading-7">
                        @farming-labs/orm
                      </code>
                      .
                    </p>
                  </div>
                </div>
                <div
                  className="-mx-5 mt-8 md:mt-2 border-y border-white/12 px-5 py-3 sm:-mx-8 sm:px-8 lg:-mx-[clamp(24px,5vw,72px)] lg:px-[clamp(24px,5vw,72px)] lg:py-2"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-fd-border) 7%, transparent), color-mix(in srgb, var(--color-fd-foreground) 5%, transparent) 1px, transparent 1px, transparent 6px)",
                  }}
                  aria-label="Changelog versions"
                >
                  <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
                    <div className="flex w-max min-w-full gap-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-white/48">
                      {changelogEntries.map((entry) => (
                        <Link
                          className="inline-flex font-mono shrink-0 items-center border border-dashed border-white/10 bg-white/[0.02] px-2.5 py-1.5 transition-colors hover:border-white/20 hover:text-white/72"
                          key={entry.version}
                          href={`/changelogs#${entry.anchor}`}
                        >
                          [{entry.version}]
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div className="hidden font-mono text-[8px] lowercase tracking-tighter text-white/72 lg:flex lg:flex-wrap lg:gap-2 lg:font-mono lg:uppercase lg:tracking-[0.12em] lg:text-white/72">
                    {changelogEntries.map((entry) => (
                      <Link
                        className="inline-flex items-center lowercase text-[8px] border border-dashed border-white/12 bg-white/[0.025] px-2.5 py-1.5 transition-colors hover:border-white/24 hover:bg-white/[0.04] hover:text-white"
                        key={entry.version}
                        href={`/changelogs#${entry.anchor}`}
                      >
                        [{entry.version}]
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </aside>

        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-[clamp(24px,5vw,72px)] lg:py-12">
          {changelogEntries.map((entry) => (
            <section
              key={entry.version}
              id={entry.anchor}
              className="relative border-b border-white/10 py-8 last:border-b-0 sm:py-9 lg:py-10"
            >
              <div className="grid gap-y-4 md:grid-cols-[9.5rem_minmax(0,1fr)] md:gap-x-8 md:items-start">
                <div className="mb-1 flex h-fit items-center justify-between gap-4 md:mb-0 md:sticky md:top-8 md:block md:self-start">
                  <time className="block font-mono text-[0.64rem] uppercase tracking-[0.16em] text-slate-500/80 sm:text-[0.66rem]">
                    {entry.date}
                  </time>
                  <div className="inline-flex border border-white/10 bg-[rgba(255,255,255,0.02)] px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-white/45 md:mt-4 sm:text-[0.66rem]">
                    [{entry.version}]
                  </div>
                </div>

                <div className="relative pb-2 md:pl-8">
                  <div className="absolute bottom-0 left-0 top-2 hidden w-px bg-white/10 md:block">
                    <div className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rounded-full bg-[var(--color-fd-primary)] shadow-[0_0_0_4px_rgba(5,5,7,1)]" />
                  </div>
                  <div className="relative z-10 space-y-5">
                    <div className="space-y-3">
                      <h2 className="m-0 font-mono text-[0.84rem] font-medium uppercase tracking-[0.14em] text-white sm:text-[0.94rem] lg:text-[0.98rem]">
                        {entry.title}
                      </h2>

                      <div className="flex flex-wrap gap-2">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="border border-white/10 bg-white/[0.025] px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-slate-500 lg:text-[0.58rem]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="m-0 max-w-3xl text-[0.88rem] leading-6 text-slate-300/82 sm:text-[0.92rem] sm:leading-7 lg:text-[0.93rem]">
                      {entry.summary}
                    </p>

                    <ul className="space-y-2.5 pl-4 text-[0.87rem] leading-6 text-slate-300/78 marker:text-white/32 sm:space-y-3 sm:pl-5 sm:text-[0.9rem] sm:leading-7 lg:text-[0.92rem]">
                      {entry.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
