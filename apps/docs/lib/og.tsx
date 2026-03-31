import { ImageResponse } from "next/og";

const OG_SIZE = {
  width: 1200,
  height: 630,
} as const;

const SITE_URL = "https://docs.farming-labs.dev";

type BuildOgImageUrlOptions = {
  title: string;
  description?: string;
  eyebrow?: string;
};

type CreateOgImageOptions = {
  title: string;
  description?: string;
  eyebrow?: string;
};

const GOOGLE_FONT_USER_AGENT =
  "Mozilla/5.0 (BB10; Touch) AppleWebKit/537.10+ (KHTML, like Gecko) Version/10.0.9.2372 Mobile Safari/537.10+";

let interBoldPromise: Promise<ArrayBuffer> | null = null;
let jetBrainsMonoPromise: Promise<ArrayBuffer> | null = null;

async function loadGoogleFont(family: string, weight: number) {
  const params = new URLSearchParams({
    family: `${family}:wght@${weight}`,
    display: "swap",
  });
  const cssUrl = `https://fonts.googleapis.com/css2?${params.toString()}`;

  const css = await fetch(cssUrl, {
    headers: { "User-Agent": GOOGLE_FONT_USER_AGENT },
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch font CSS for ${family}.`);
    }

    return res.text();
  });

  const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('(opentype|truetype|woff)'\)/);
  if (!match) {
    throw new Error(`Failed to resolve a supported font file for ${family}.`);
  }

  return fetch(match[1]).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to download font binary for ${family}.`);
    }

    return res.arrayBuffer();
  });
}

async function loadOgFonts() {
  interBoldPromise ??= loadGoogleFont("Inter", 700);
  jetBrainsMonoPromise ??= loadGoogleFont("JetBrains Mono", 400);

  const [interBold, jetBrainsMono] = await Promise.all([interBoldPromise, jetBrainsMonoPromise]);

  return [
    {
      name: "Inter",
      data: interBold,
      style: "normal" as const,
      weight: 700 as const,
    },
    {
      name: "JetBrains Mono",
      data: jetBrainsMono,
      style: "normal" as const,
      weight: 400 as const,
    },
  ];
}

export function buildOgImageUrl({ title, description, eyebrow = "Docs" }: BuildOgImageUrlOptions) {
  const params = new URLSearchParams();
  params.set("title", title);
  params.set("eyebrow", eyebrow);

  if (description) {
    params.set("description", description);
  }

  return `${SITE_URL}/api/og?${params.toString()}`;
}

export async function createOgImageResponse({
  title,
  description,
  eyebrow = "Docs",
}: CreateOgImageOptions) {
  const fonts = await loadOgFonts();
  const resolvedDescription =
    description ??
    "Unified schema, typed runtime, and generator-first tooling across modern database and ORM stacks.";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#050507",
        color: "#ffffff",
        padding: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          opacity: 0.08,
          backgroundImage:
            "repeating-linear-gradient(-45deg, #ffffff, #ffffff 1px, transparent 1px, transparent 6px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 55,
          left: 0,
          right: 0,
          height: 1,
          display: "flex",
          backgroundColor: "rgba(255,255,255,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          height: 1,
          display: "flex",
          backgroundColor: "rgba(255,255,255,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 79,
          width: 1,
          height: "100%",
          display: "flex",
          backgroundColor: "rgba(255,255,255,0.14)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 79,
          width: 1,
          height: "100%",
          display: "flex",
          backgroundColor: "rgba(255,255,255,0.14)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: "20%",
          width: 120,
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
          filter: "blur(12px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -20,
          left: "46%",
          width: 92,
          height: "110%",
          display: "flex",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          filter: "blur(10px)",
        }}
      />
        <div
        style={{
          position: "absolute",
          top: -20,
          left: "66%",
          width: 92,
          height: "110%",
          display: "flex",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          filter: "blur(10px)",
        }}
      />
        <div
        style={{
          position: "absolute",
          top: -20,
          left: "86%",
          width: 92,
          height: "110%",
          display: "flex",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          filter: "blur(10px)",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "50px 80px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 20,
            width: 1,
            backgroundColor: "rgba(255,255,255,0.4)",
          }}
        />
        <span
          style={{
            display: "flex",
            fontFamily: '"JetBrains Mono"',
            fontSize: 22,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow === "Docs" ? "@farming-labs/orm" : `[ ${eyebrow} ]`}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0 80px",
          marginTop: "auto",
          marginBottom: 100,
          position: "relative",
        }}
      >
        <h1
          style={{
            display: "flex",
            margin: 0,
            padding: 0,
            maxWidth: 860,
            fontFamily: "Inter",
            fontSize: title.length > 42 ? 50 : title.length > 26 ? 58 : 72,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.05em",
            lineHeight: 0.94,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            display: "flex",
            margin: 0,
            marginTop: 24,
            maxWidth: 700,
            fontFamily: '"JetBrains Mono"',
            fontSize: 22,
            color: "rgba(255,255,255,0.42)",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {resolvedDescription}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "40px 80px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 30 }}>
          <span
            style={{
              display: "flex",
              fontFamily: '"JetBrains Mono"',
              fontSize: 20,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            documentation
          </span>
          <div
            style={{
              display: "flex",
              height: 20,
              width: 1,
              backgroundColor: "rgba(255,255,255,0.4)",
            }}
          />
          <span
            style={{
              display: "flex",
              fontFamily: '"JetBrains Mono"',
              fontSize: 20,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            orm.farming-labs.dev
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "#ffffff",
            color: "#000000",
            padding: "12px 24px",
            fontFamily: '"JetBrains Mono"',
            fontSize: 16,
            marginBottom: 30,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          get started →
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts,
    },
  );
}

export const ogImageSize = OG_SIZE;
