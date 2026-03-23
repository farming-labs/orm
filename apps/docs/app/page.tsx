import Link from "next/link";
import BeamBackground from "@/components/ui/beam-background";
import { PatternText } from "@/components/ui/pattern-text";
import styles from "./page.module.css";
import { cn } from "@/lib/utils";

const platformCards = [
  {
    label: "Core contract",
    title: "Define the data model once.",
    body: "Fields, relations, defaults, and references live in one product surface instead of spreading across adapter-specific implementations.",
    tone: "cyan",
  },
  {
    label: "App outputs",
    title: "Generate the stack each app already uses.",
    body: "Turn the same schema into Prisma, Drizzle, or safe SQL artifacts so consumers can meet your package in their own environment.",
    tone: "emerald",
  },
  {
    label: "Product docs",
    title: "Keep the story aligned with the implementation.",
    body: "Landing page, docs, CLI, demo, and workspace tests all reinforce the same system instead of drifting apart.",
    tone: "violet",
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
  { label: "Schema core", value: "Live", tone: "live" },
  { label: "CLI generation", value: "Live", tone: "live" },
  { label: "Memory runtime", value: "Live", tone: "live" },
  { label: "Prisma runtime package", value: "Next", tone: "next" },
  { label: "Drizzle runtime package", value: "Next", tone: "next" },
  { label: "Kysely runtime package", value: "Next", tone: "next" },
  { label: "Direct SQL package", value: "Future", tone: "future" },
  { label: "Mongoose package", value: "Future", tone: "future" },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.gridMask} />

      <section className={styles.hero}>
        <div className={styles.heroBackground} aria-hidden="true">
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
        <div className={styles.heroScrim} />

        <div className={styles.heroContent}>
          <div className={styles.heroHead}>
            <h1 className={styles.heroPatternTitle}>
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
            <p className="text-white/70 text-lg tracking-tight font-light font-mono uppercase">
              Define the data model once, then generate the storage layer each
              app stack wants along with built-in cli.
            </p>

            <div className={styles.heroActions}>
              <Link href="/docs" className={styles.primaryButton}>
                Explore the docs
              </Link>
              <Link href="/docs/getting-started" className={styles.secondaryButton}>
                Start here
              </Link>
            </div>
          </div>
        </div>

        <hr className={styles.heroDivider} aria-hidden />

        <div className={cn(styles.heroFeatureStrip , "-mt-5")}>
          <div className={styles.heroFeatureBox} aria-label="Features">
            {featureCards.map((card) => (
              <div key={card.title} className={styles.heroFeatureRow}>
                <h3 className={styles.heroFeatureTitle}>{card.title}</h3>
                <p className={styles.heroFeatureBody}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className={`${styles.section} ${styles.sectionAfterHero}`}>
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>Platform</span>
          <h2 className={styles.sectionTitle}>
            Built as a system, not a pile of storage-specific glue.
          </h2>
          <p className={styles.sectionText}>
            The point is not to hide complexity with magic. It is to centralize
            the real shared contract so generation, docs, examples, and future
            drivers all line up around the same data model.
          </p>
        </div>

        <div className={styles.platformGrid}>
          {platformCards.map((card) => (
            <article
              key={card.title}
              className={`${styles.platformCard} ${styles[`tone${card.tone[0].toUpperCase()}${card.tone.slice(1)}`]}`}
            >
              <span className={styles.cardLabel}>{card.label}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className={styles.section}>
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>Features</span>
          <h2 className={styles.sectionTitle}>
            A modern product surface for teams shipping reusable packages.
          </h2>
          <p className={styles.sectionText}>
            This works especially well when your package has to meet Prisma
            users, Drizzle users, SQL-first teams, and documentation readers
            without rewriting the same story over and over.
          </p>
        </div>

        <div className={styles.featureLayout}>
          <article className={styles.featureShowcase}>
            <div className={styles.featureStack}>
              <div className={styles.featureFrame}>
                <span className={styles.frameTitle}>Unified contract</span>
                <div className={styles.frameBars}>
                  <span className={styles.barWide} />
                  <span className={styles.barMid} />
                  <span className={styles.barSmall} />
                </div>
              </div>
              <div className={styles.featureFrame}>
                <span className={styles.frameTitle}>Generated outputs</span>
                <div className={styles.outputDots}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className={styles.featureFrame}>
                <span className={styles.frameTitle}>Runtime path</span>
                <div className={styles.frameChart}>
                  <span className={styles.chartA} />
                  <span className={styles.chartB} />
                  <span className={styles.chartC} />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="use-cases" className={styles.section}>
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>Use cases</span>
          <h2 className={styles.sectionTitle}>
            A better fit for auth, billing, and platform libraries than ORM-by-ORM adapters.
          </h2>
          <p className={styles.sectionText}>
            Reusable packages need a stable storage-facing contract. This is the
            kind of system that keeps that contract intact while still meeting
            the integration needs of downstream apps.
          </p>
        </div>

        <div className={styles.useCaseGrid}>
          {useCases.map((item) => (
            <article key={item.title} className={styles.useCaseCard}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>Support matrix</span>
          <h2 className={styles.sectionTitle}>
            Sharp visuals, but still honest about the current implementation.
          </h2>
          <p className={styles.sectionText}>
            The project can look polished without pretending every runtime
            package is already done. The landing page should sell the direction
            while still telling the truth.
          </p>
        </div>

        <div className={styles.supportPanel}>
          {supportRows.map((row) => (
            <article key={row.label} className={styles.supportRow}>
              <div>
                <strong>{row.label}</strong>
                <p>{row.value}</p>
              </div>
              <span
                className={`${styles.statusPill} ${
                  row.tone === "live"
                    ? styles.statusLive
                    : row.tone === "next"
                      ? styles.statusNext
                      : styles.statusFuture
                }`}
              >
                {row.value}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div>
          <span className={styles.kicker}>Next step</span>
          <h2 className={styles.sectionTitle}>
            Follow the docs route and the example workflow that this monorepo is already testing.
          </h2>
          <p className={styles.sectionText}>
            The homepage sets the tone, then <code>/docs</code> carries the
            product forward with `@farming-labs/docs`, the pixel-border theme,
            and the actual generator story underneath.
          </p>
        </div>

        <div className={styles.ctaActions}>
          <Link href="/docs" className={styles.primaryButton}>
            Open documentation
          </Link>
          <Link href="/docs/use-cases" className={styles.secondaryButton}>
            Browse use cases
          </Link>
        </div>
      </section>
    </main>
  );
}
