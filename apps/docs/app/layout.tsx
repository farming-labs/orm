import type { Metadata } from "next";
import { RootProvider } from "@farming-labs/theme";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Databuddy } from "@databuddy/sdk/react";
import { buildOgImageUrl } from "@/lib/og";

const heading = Geist({
  subsets: ["latin"],
  variable: "--app-font-heading",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--app-font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.farming-labs.dev"),
  title: {
    default: "@farming-labs/orm",
    template: "%s – @farming-labs/orm",
  },
  description:
    "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
  openGraph: {
    title: "@farming-labs/orm",
    description:
      "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
    images: [
      {
        url: buildOgImageUrl({
          title: "Farming Labs ORM",
          eyebrow: "Platform",
          description:
            "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
        }),
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "@farming-labs/orm",
    description:
      "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
    images: [
      buildOgImageUrl({
        title: "Farming Labs ORM",
        eyebrow: "Platform",
        description:
          "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
      }),
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${heading.className} ${heading.variable} ${mono.variable}`}>
        <RootProvider>
          {children}
          <Databuddy clientId="0269b778-9ed5-485b-a153-93b77b35d5d5" />
        </RootProvider>
      </body>
    </html>
  );
}
