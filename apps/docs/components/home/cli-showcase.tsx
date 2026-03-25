"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/** Token order + classes — spaces tied to preceding token so typing stays aligned. */
const CLI_PARTS = [
  { text: "pnpx", className: "text-white" },
  { text: " ", className: "text-white" },
  { text: "@farming-labs/orm-cli", className: "text-white/85" },
  { text: " ", className: "text-white/85" },
  { text: "generate", className: "text-white/75" },
  { text: " ", className: "text-white/75" },
  { text: "prisma", className: "text-emerald-200/90" },
  { text: " ", className: "text-emerald-200/90" },
  { text: "-c", className: "text-white/55" },
  { text: " ", className: "text-white/55" },
  { text: "./farm-orm.config.ts", className: "text-white/65" },
] as const;

const COMMAND = CLI_PARTS.map((p) => p.text).join("");

function renderTypedSpans(typedLen: number) {
  let remaining = typedLen;
  return CLI_PARTS.flatMap((part, i) => {
    if (remaining <= 0) return [];
    const take = Math.min(part.text.length, remaining);
    remaining -= take;
    if (take === 0) return [];
    const chunk = part.text.slice(0, take);
    return [
      <span key={`cli-${i}`} className={part.className}>
        {chunk}
      </span>,
    ];
  });
}

export function CliShowcase({ className }: { className?: string }) {
  const [typedLen, setTypedLen] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowEffects, setLowEffects] = useState(false);

  const commandLen = COMMAND.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqNarrow = window.matchMedia("(max-width: 767px)");
    let intervalId: number | undefined;

    const readLowEffects = () => {
      const nav = navigator as Navigator & {
        connection?: { saveData?: boolean };
        deviceMemory?: number;
      };
      const saveData = nav.connection?.saveData === true;
      const lowMem = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
      return mqNarrow.matches || saveData || lowMem;
    };

    const apply = () => {
      if (intervalId != null) window.clearInterval(intervalId);
      const prefersReduced = mqReduce.matches;
      const isLow = readLowEffects();
      setReducedMotion(prefersReduced);
      setLowEffects(isLow);

      if (prefersReduced) {
        setTypedLen(commandLen);
        return;
      }

      setTypedLen(0);
      const stepMs = isLow ? 42 : 28;
      let i = 0;
      intervalId = window.setInterval(() => {
        i += 1;
        setTypedLen(Math.min(i, commandLen));
        if (i >= commandLen && intervalId != null) window.clearInterval(intervalId);
      }, stepMs) as unknown as number;
    };

    apply();
    mqReduce.addEventListener("change", apply);
    mqNarrow.addEventListener("change", apply);
    return () => {
      mqReduce.removeEventListener("change", apply);
      mqNarrow.removeEventListener("change", apply);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [commandLen]);

  const spans = useMemo(() => renderTypedSpans(typedLen), [typedLen]);
  const shimmerOn = !reducedMotion && !lowEffects;

  return (
    <div className={cn("w-full rounded-none max-w-full", className)}>
      <p className="mb-3 mt-0 font-mono text-[0.72rem] font-light uppercase tracking-tight text-white/50">
        Generate from your config
      </p>
      <div
        className={cn(
          "relative overflow-x-auto overscroll-x-contain rounded-none border border-white/12",
          "bg-[rgba(6,6,8,0.42)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:backdrop-blur-xl",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          aria-hidden
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)",
            backgroundSize: "200% 100%",
            animation: shimmerOn ? "home-cli-shimmer 6s ease-in-out infinite" : "none",
          }}
        />
        <pre
          className={cn(
            "relative m-0 max-w-full overflow-x-auto overscroll-x-contain px-3 py-3 font-mono sm:px-4 sm:py-3.5",
            "text-[clamp(0.7rem,3.1vw,0.85rem)] leading-relaxed [tab-size:2] [-webkit-overflow-scrolling:touch]",
          )}
        >
          <code className="wrap-break-word [word-break:break-word]">{spans}</code>
          <span
            className="inline-block min-w-[0.55ch] translate-y-px text-white/80 home-cli-caret"
            aria-hidden
          >
            ▍
          </span>
        </pre>
      </div>
      <p className="mb-0 mt-3 font-mono text-[0.68rem] font-light leading-relaxed text-white/50">
        Swap <code className="text-slate-400/95">prisma</code> for{" "}
        <code className="text-slate-400/95">drizzle</code> or{" "}
        <code className="text-slate-400/95">sql</code>.{" "}
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
