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

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const metadata: Metadata = {
  metadataBase: baseUrl ? new URL(baseUrl) : undefined,
  title: {
    default: "@farming-labs/docs",
    template: "%s – @farming-labs/docs",
  },
  description:
    "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
  openGraph: {
    title: "@farming-labs/orm",
    description:
      "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "@farming-labs/orm",
    description:
      "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
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
