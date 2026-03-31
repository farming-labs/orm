import type { Metadata } from "next";
import Link from "next/link";
import { ChangelogPage } from "@/components/docs/changelog-page";

export const metadata: Metadata = {
  title: "Changelogs - Farming Labs ORM",
  description:
    "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.",
};

export default function ChangelogsRoute() {
  return (
    <main className="min-h-svh bg-[#050507] text-slate-50">
      <ChangelogPage />
    </main>
  );
}
