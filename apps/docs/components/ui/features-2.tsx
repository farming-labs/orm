import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Braces, Code2, Terminal } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Braces,
    title: "Unified schema",
    description:
      "Models, fields, and relations in one TypeScript contract—shared by generators and every runtime driver.",
    href: "/docs/schema",
  },
  {
    icon: Terminal,
    title: "Generator-first CLI",
    description:
      "farm-orm emits Prisma, Drizzle, or SQL from the same sources so each app keeps its preferred stack.",
    href: "/docs/cli",
  },
  {
    icon: Code2,
    title: "One query API",
    description:
      "Swap memory, Prisma, Drizzle, SQL pools, or Mongo without rewriting call sites—the same typed surface everywhere.",
    href: "/docs/runtime",
  },
] as const;

function CardDecorator({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative mx-auto size-32 mask-[radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] md:size-36"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-size-[20px_20px] opacity-[0.35] dark:opacity-25" />
      <div className="bg-card absolute inset-0 m-auto flex size-11 items-center justify-center rounded-none border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:size-12">
        {children}
      </div>
    </div>
  );
}

export function DocsOverviewFeatures({ className }: { className?: string }) {
  return (
    <section className={cn("not-prose py-10 md:py-14", className)} aria-label="Product features">
      <div className="@container flex flex-col items-start max-w-3xl px-0">
        <div className="text-left">
          <p className="text-balance text-[10px] uppercase font-mono tracking-tight text-white/95">
            Built for how you ship
          </p>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-sm leading-relaxed text-white/55 md:text-[0.9375rem]">
            One schema, one query API, and generators that match each app’s stack—without forking
            your data model.
          </p>
        </div>

        <div className="@md:grid-cols-2 mx-auto mt-8 grid max-w-sm grid-cols-1 gap-5 *:text-center md:mt-10 md:max-w-none md:gap-6">
          {features.map(({ icon: Icon, title, description, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group block h-full rounded-none outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-[#d9f3ff]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <Card className="card-custom h-full border-white/8 bg-muted/80 transition-[border-color,background-color] duration-200 group-hover:border-white/15 group-hover:bg-muted">
                <CardHeader className="pb-2">
                  <CardDecorator>
                    <Icon
                      className="size-5 text-[#d9f3ff] md:size-6"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </CardDecorator>
                  <p className="mt-5 text-left uppercase font-mono text-[10px] text-white/90 md:mt-6">
                    {title}
                  </p>
                </CardHeader>
                <CardContent className="">
                  <p className="text-left text-[8px] text-white/50">{description}</p>
                  <p className="mt-4 text-left font-mono text-[8px] uppercase tracking-wider text-[#d9f3ff] opacity-0 transition-opacity duration-200 group-hover:opacity-90">
                    View docs{" "}
                    <ArrowUpRight className="mb-1 inline-flex justify-center items-center size-4" />
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
