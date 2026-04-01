import type { Metadata } from "next";
import { ChangelogPage } from "@/components/docs/changelog-page";
import { buildOgImageUrl } from "@/lib/og";

const changelogDescription =
  "Release notes for runtime additions, docs shifts, and broader platform changes across Farming Labs ORM.";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.farming-labs.dev"),
  title: "Changelogs - Farming Labs ORM",
  description: changelogDescription,
  openGraph: {
    title: "Changelogs - Farming Labs ORM",
    description: changelogDescription,
    images: [
      {
        url: buildOgImageUrl({
          title: "Changelogs",
          eyebrow: "Release Notes",
          description: changelogDescription,
        }),
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Changelogs - Farming Labs ORM",
    description: changelogDescription,
    images: [
      buildOgImageUrl({
        title: "Changelogs",
        eyebrow: "Release Notes",
        description: changelogDescription,
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
