import type { ReactNode } from "react";

type HoverLinkProps = {
  href: string;
  children: ReactNode;
  preview?: ReactNode;
};

export function HoverLink({ href, children, preview }: HoverLinkProps) {
  return (
    <span className="group relative inline-flex">
      <a
        className="underline decoration-dotted underline-offset-4"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 border border-dashed border-white/15 bg-black px-3 py-2 text-xs leading-6 text-white/75 shadow-[8px_8px_0_rgba(0,0,0,0.3)] opacity-0 transition duration-150 group-hover:block group-hover:opacity-100">
        {preview ?? href}
      </span>
    </span>
  );
}
