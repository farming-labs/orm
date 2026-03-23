import type { Metadata } from "next";
import { RootProvider } from "@farming-labs/theme";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  title: "Farming Labs ORM",
  description:
    "Unified schema, typed runtime, and generator-first tooling for Prisma, Drizzle, and safe SQL.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${heading.className} ${heading.variable} ${mono.variable}`}>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
