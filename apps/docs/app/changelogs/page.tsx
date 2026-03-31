import type { Metadata } from "next";
import { ChangelogPage } from "@/components/docs/changelog-page";
import { buildOgImageUrl } from "@/lib/og";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.farming-labs.dev"),
  title: "Changelogs - Farming Labs ORM",
  description:
    "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.",
  openGraph: {
    title: "Changelogs - Farming Labs ORM",
    description:
      "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.",
    images: [
      {
        url: buildOgImageUrl({
          title: "Changelogs",
          eyebrow: "Release Notes",
          description:
            "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.",
        }),
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Changelogs - Farming Labs ORM",
    description:
      "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.",
    images: [
      buildOgImageUrl({
        title: "Changelogs",
        eyebrow: "Release Notes",
        description:
          "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.",
      }),
    ],
  },
};

export default function ChangelogsRoute() {
  return (
    <main className="min-h-svh bg-[#050507] text-slate-50">
      <ChangelogPage />
    </main>
  );
}
