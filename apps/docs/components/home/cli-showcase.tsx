"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const COMMAND = "pnpm exec farm-orm generate prisma -c ./farm-orm.config.ts";

export function CliShowcase({ className }: { className?: string }) {
  const [typed, setTyped] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const prefersReduced = mq.matches;
    setReducedMotion(prefersReduced);
    if (prefersReduced) {
      setTyped(COMMAND);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(COMMAND.slice(0, i));
      if (i >= COMMAND.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={cn("w-full rounded-none max-w-full", className)}>
      <p className="mb-3 mt-0 font-mono text-[0.72rem] font-light uppercase tracking-tight text-slate-500">
        Generate from your config
      </p>
      <div
        className={cn(
          "relative overflow-x-auto rounded-none border border-white/12",
          "bg-[rgba(6,6,8,0.42)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          aria-hidden
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)",
            backgroundSize: "200% 100%",
            animation: reducedMotion ? "none" : "home-cli-shimmer 6s ease-in-out infinite",
          }}
        />
        <pre
          className={cn(
            "relative m-0 overflow-x-auto px-4 py-3.5 font-mono text-[clamp(0.75rem,2.4vw,0.85rem)] leading-relaxed",
            "text-slate-200 [tab-size:2]",
          )}
        >
          <code className="break-all text-white/95">{typed}</code>
          <span
            className="inline-block min-w-[0.55ch] translate-y-px text-white/95 home-cli-caret"
            aria-hidden
          >
            ▍
          </span>
        </pre>
      </div>
      <p className="mb-0 mt-3 font-mono text-[0.68rem] font-light leading-relaxed text-slate-500">
        Swap{" "}
        <code className="text-slate-400/95">prisma</code> for{" "}
        <code className="text-slate-400/95">drizzle</code> or <code className="text-slate-400/95">sql</code>
        .{" "}
        <Link
          href="/docs/cli"
          className="text-slate-400 underline decoration-dotted decoration-from-font underline-offset-4 transition-colors hover:text-slate-200"
        >
          CLI docs
        </Link>
      </p>
    </div>
  );
}
