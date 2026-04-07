import type { ReactNode } from "react";
import { defineDocs } from "@farming-labs/docs";
import { pixelBorder } from "@farming-labs/theme/pixel-border";
import {
  siCloudflare,
  siDrizzle,
  siFirebase,
  siMongodb,
  siPrisma,
  siRedis,
  siSequelize,
  siSupabase,
  siTypeorm,
  siUnjs,
} from "simple-icons";
import {
  BookOpen,
  Boxes,
  Building2,
  Code2,
  CreditCard,
  Database,
  Braces,
  FileCode2,
  HardDrive,
  Network,
  Package,
  Rocket,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  LayoutGrid,
  Pin,
} from "lucide-react";
import { submitDocsFeedback } from "./lib/feedback";
import { latestChangelogEntry } from "./lib/changelog";

const icon = (node: ReactNode) => (
  <span className="flex size-4 shrink-0 items-center justify-center text-white/70 [&_svg]:size-4">
    {node}
  </span>
);

const brandIcon = (path: string, title: string) =>
  icon(
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" role="img">
      <title>{title}</title>
      <path d={path} />
    </svg>,
  );

const dynamodbIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 80 80" role="img">
    <title>Amazon DynamoDB</title>
    <path
      fill="currentColor"
      d="M52.0859525,54.8502506 C48.7479569,57.5490338 41.7449661,58.9752927 35.0439749,58.9752927 C28.3419838,58.9752927 21.336993,57.548042 17.9999974,54.8492588 L17.9999974,60.284515 L18.0009974,60.284515 C18.0009974,62.9952002 24.9999974,66.0163299 35.0439749,66.0163299 C45.0799617,66.0163299 52.0749525,62.9991676 52.0859525,60.290466 L52.0859525,54.8502506 Z M52.0869525,44.522272 L54.0869499,44.5113618 L54.0869499,44.522272 C54.0869499,45.7303271 53.4819507,46.8580436 52.3039522,47.8905439 C53.7319503,49.147199 54.0869499,50.3800499 54.0869499,51.257824 C54.0869499,51.263775 54.0859499,51.2687342 54.0859499,51.2746852 L54.0859499,60.284515 L54.0869499,60.284515 C54.0869499,65.2952658 44.2749628,68 35.0439749,68 C25.8349871,68 16.0499999,65.3071678 16.003,60.3192292 C16.003,60.31427 16,60.3093109 16,60.3043517 L16,51.2548485 C16,51.2528648 16.002,51.2498893 16.002,51.2469138 C16.005,50.3691398 16.3609995,49.1412479 17.7869976,47.8875684 C16.3699995,46.6358725 16.01,45.4149236 16.001,44.5440924 L16.002,44.5440924 C16.002,44.540125 16,44.5371495 16,44.5331822 L16,35.483679 C16,35.4807035 16.002,35.477728 16.002,35.4747525 C16.005,34.5969784 16.3619995,33.3690866 17.7879976,32.1173908 C16.3699995,30.8647031 16.01,29.6427623 16.001,28.7729229 L16.002,28.7729229 C16.002,28.7689556 16,28.7649882 16,28.7610209 L16,19.7125095 C16,19.709534 16.002,19.7065585 16.002,19.703583 C16.019,14.6997751 25.8199871,12 35.0439749,12 C40.2549681,12 45.2609615,12.8281823 48.7779569,14.2722941 L48.0129579,16.1052054 C44.7299622,14.7573015 40.0029684,13.9836701 35.0439749,13.9836701 C24.9999882,13.9836701 18.0009974,17.0047998 18.0009974,19.7174687 C18.0009974,22.4291458 24.9999882,25.4502754 35.0439749,25.4502754 C35.3149746,25.4532509 35.5799742,25.4502754 35.8479739,25.4403571 L35.9319738,27.4220435 C35.6359742,27.4339456 35.3399745,27.4339456 35.0439749,27.4339456 C28.3419838,27.4339456 21.336993,26.0066949 18,23.3079117 L18,28.7401923 L18.0009974,28.7401923 L18.0009974,28.7630046 C18.0109974,29.8034395 19.0779959,30.7119605 19.9719948,31.2892085 C22.6619912,33.0040913 27.4819849,34.1754485 32.8569778,34.4184481 L32.7659779,36.4001346 C27.3209851,36.1531677 22.5529914,35.0234675 19.4839954,33.2917235 C18.7279964,33.8570695 18.0009974,34.6217743 18.0009974,35.4886382 C18.0009974,38.2003153 24.9999882,41.2214449 35.0439749,41.2214449 C36.0289736,41.2214449 37.0069723,41.1887143 37.9519711,41.1232532 L38.0909709,43.1019642 C37.1009722,43.1704008 36.0749736,43.205115 35.0439749,43.205115 C28.3419838,43.205115 21.336993,41.7778644 18,39.0790811 L18,44.5113618 L18.0009974,44.5113618 C18.0109974,45.574609 19.0779959,46.4821381 19.9719948,47.060378 C23.0479907,49.0232196 28.8239831,50.2451604 35.0439749,50.2451604 L35.4839744,50.2451604 L35.4839744,52.2288305 L35.0439749,52.2288305 C28.7249832,52.2288305 22.9819908,51.0554896 19.4699954,49.0728113 C18.7179964,49.6371655 18.0009974,50.397903 18.0009974,51.257824 C18.0009974,53.9695011 24.9999882,56.9916225 35.0439749,56.9916225 C45.0799617,56.9916225 52.0749525,53.9744602 52.0859525,51.2647668 L52.0859525,51.2548485 L52.0859525,51.2538566 C52.0839525,50.391952 51.3639534,49.6312145 50.6099544,49.0668603 C50.1219551,49.3435823 49.5989558,49.6103859 49.0039566,49.8553692 L48.2379576,48.022458 C48.9639566,47.7239156 49.5939558,47.4015692 50.1109551,47.0623616 C51.0129539,46.4742034 52.0869525,45.5547723 52.0869525,44.522272 L52.0869525,44.522272 Z M60.6529412,30.0166841 L55.0489486,30.0166841 C54.717949,30.0166841 54.4069494,29.8540231 54.2219497,29.5822603 C54.0349499,29.3104975 53.99695,28.9643471 54.1189498,28.6598537 L57.5279453,20.1380068 L44.6189702,20.1380068 L38.6189702,32.0400276 L45.0009618,32.0400276 C45.3199614,32.0400276 45.619961,32.1917784 45.8089608,32.44668 C45.9959605,32.7025735 46.0509604,33.0308709 45.9539606,33.3333806 L40.2579681,51.089212 L60.6529412,30.0166841 Z M63.7219372,29.7121907 L38.7229701,55.539576 C38.5279703,55.7399267 38.2659707,55.8440694 38.000971,55.8440694 C37.8249713,55.8440694 37.6479715,55.7994368 37.4899717,55.7052124 C37.0899722,55.4691557 36.9069725,54.992083 37.0479723,54.5517083 L43.6339636,34.0236978 L37.0009724,34.0236978 C36.6539728,34.0236978 36.3329732,33.8461593 36.1499735,33.5535679 C35.9679737,33.2609766 35.9509737,32.8959813 36.1069735,32.5885124 L43.1069643,18.7028214 C43.2759641,18.3665893 43.6219636,18.1543366 44.0009631,18.1543366 L59.0009434,18.1543366 C59.331943,18.1543366 59.6429425,18.3179894 59.8279423,18.5887604 C60.0149421,18.861515 60.052942,19.2066736 59.9309422,19.5121588 L56.5219467,28.0330139 L62.9999381,28.0330139 C63.3999376,28.0330139 63.7629371,28.2710544 63.9199369,28.6360497 C64.0769367,29.0020368 63.9989368,29.4255504 63.7219372,29.7121907 L63.7219372,29.7121907 Z M19.4549955,60.6743062 C20.8719936,61.4727334 22.6559912,62.1442057 24.7569885,62.6678947 L25.2449878,60.7437346 C23.3459903,60.2706293 21.6859925,59.6497405 20.4429942,58.949505 L19.4549955,60.6743062 Z M24.7569885,46.7985335 L25.2449878,44.8753653 C23.3459903,44.4012681 21.6859925,43.7803794 20.4429942,43.0801438 L19.4549955,44.804945 C20.8719936,45.6033722 22.6549912,46.2748446 24.7569885,46.7985335 L24.7569885,46.7985335 Z M19.4549955,28.9355839 L20.4429942,27.2107827 C21.6839925,27.9110182 23.3449903,28.5309151 25.2449878,29.0060041 L24.7569885,30.9291723 C22.6529912,30.4044916 20.8699936,29.7330193 19.4549955,28.9355839 L19.4549955,28.9355839 Z"
    />
  </svg>,
);

const kyselyIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 132 132" role="img">
    <title>Kysely</title>
    <rect x="2" y="2" width="128" height="128" rx="16" fill="currentColor" fillOpacity="0.08" />
    <path
      fill="currentColor"
      d="M41.2983 109V23.9091H46.4918V73.31H47.0735L91.9457 23.9091H98.8427L61.9062 64.1694L98.5103 109H92.0288L58.5824 67.9087L46.4918 81.2873V109H41.2983Z"
    />
    <rect
      x="2"
      y="2"
      width="128"
      height="128"
      rx="16"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
    />
  </svg>,
);

const xataIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 400 400" role="img">
    <title>Xata</title>
    <path
      fill="currentColor"
      d="M367.194 224.81C398.753 279.991 391.197 351.465 344.491 398.831L343.788 399.543L268.126 323.871L367.194 224.81ZM183.558 243.341C177.353 265.716 165.712 286.892 148.61 304.778L146.247 307.135L44.5424 205.388C-11.93 148.91 -12.1829 57.4839 43.8029 0.703737L44.5125 1.66796e-06L149.023 104.51C185.235 142.689 196.745 195.719 183.558 243.341ZM32.3338 224.81C0.768055 279.991 8.34612 351.465 55.0435 398.831L55.7559 399.543L131.414 323.871L32.3338 224.81ZM215.98 243.341C222.166 265.716 233.831 286.892 250.931 304.778L253.294 307.135L354.985 205.388C411.468 148.91 411.707 57.4839 355.724 0.703737L355.02 1.66796e-06L250.504 104.51C214.305 142.689 202.779 195.719 215.98 243.341Z"
    />
  </svg>,
);

const mikroormIcon = icon(
  <svg aria-hidden="true" viewBox="1637 0 441 461" role="img">
    <title>MikroORM</title>
    <path
      fill="currentColor"
      d="M1857.682 0c-121.265 0-219.92 55.759-219.92 124.287 0 13.732 4.016 26.941 11.332 39.297a95.826 95.826 0 0 0 3.627 5.677 131.285 131.285 0 0 0 3.814 5.206c15.311 19.522 39.23 36.417 69.074 49.126a253.465 253.465 0 0 0 8.601 3.493 306.503 306.503 0 0 0 9.125 3.328c33.344 11.511 72.492 18.16 114.347 18.16 41.839 0 80.995-6.649 114.339-18.16a316.74 316.74 0 0 0 9.124-3.328 261.755 261.755 0 0 0 8.601-3.493c29.838-12.708 53.757-29.604 69.06-49.126a107.24 107.24 0 0 0 3.83-5.206 99.8 99.8 0 0 0 3.628-5.669c7.32-12.364 11.329-25.572 11.329-39.305C2077.592 55.759 1978.939 0 1857.682 0zm114.616 145.88a53.535 53.535 0 0 1-1.997 3.126 57.159 57.159 0 0 1-2.097 2.857c-8.414 10.718-21.563 20.007-37.941 26.986a142.574 142.574 0 0 1-4.743 1.922 173.019 173.019 0 0 1-5.003 1.84c-18.324 6.313-39.844 9.978-62.835 9.978-22.992 0-44.512-3.665-62.836-9.978a180.965 180.965 0 0 1-5.019-1.84 134.639 134.639 0 0 1-4.72-1.922c-16.395-6.979-29.537-16.268-37.958-26.986a70.948 70.948 0 0 1-2.095-2.857 52.167 52.167 0 0 1-1.989-3.126c-4.024-6.799-6.238-14.039-6.238-21.593 0-37.659 54.212-68.303 120.854-68.303s120.847 30.644 120.847 68.303c0 7.554-2.208 14.794-6.23 21.593z"
    />
    <path
      fill="currentColor"
      fillOpacity="0.7"
      d="M2066.263 185.334c-11.385 13.53-26.591 25.976-45.4 36.844-5.027 2.902-10.264 5.632-15.655 8.235a268.611 268.611 0 0 1-7.601 3.493 322.519 322.519 0 0 1-7.861 3.328c-38.504 15.61-84.188 24.054-132.063 24.054-47.892 0-93.562-8.444-132.073-24.054a311.849 311.849 0 0 1-7.869-3.328 279.229 279.229 0 0 1-7.599-3.493c-5.385-2.603-10.621-5.333-15.64-8.235-18.826-10.868-34.039-23.313-45.408-36.844-7.315 12.378-11.332 25.572-11.332 39.312 0 16.215 5.587 31.72 15.624 45.931a126.84 126.84 0 0 0 3.95 5.236 131.462 131.462 0 0 0 4.054 4.779c36.291 40.494 110.622 68.333 196.292 68.333 85.655 0 159.986-27.839 196.284-68.333a119.467 119.467 0 0 0 4.047-4.779 112.103 112.103 0 0 0 3.939-5.229c10.053-14.219 15.64-29.708 15.64-45.939 0-13.739-4.009-26.94-11.329-39.311z"
    />
  </svg>,
);

const edgedbIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 180 180" role="img">
    <title>Gel</title>
    <rect width="180" height="180" fill="currentColor" fillOpacity="0.08" />
    <path
      fill="currentColor"
      d="M55 66.042C55 88.75 73.091 107.083 95.5 107.083c22.203 0 40.5-18.333 40.5-41.041C136 43.542 117.703 25 95.5 25 73.091 25 55 43.542 55 66.042Zm10.69 61.458C67.336 141.875 79.053 155 95.5 155c16.241 0 28.371-13.125 30.015-27.5 2.262-20.833-16.446-13.958-30.015-13.958-13.568 0-32.071-6.875-29.81 13.958Z"
    />
  </svg>,
);

const surrealdbIcon = icon(
  <svg aria-hidden="true" viewBox="0 0 46.3108 53.82" role="img">
    <title>SurrealDB</title>
    <path
      fill="currentColor"
      d="M23.1554 14.1594L36.0177 21.2556V18.4105L23.1554 11.3308C21.2423 12.3854 11.9967 17.4768 10.2931 18.4105C11.8754 19.2838 28.4922 28.4286 38.5924 33.987V36.821C37.2196 37.579 23.1554 45.3178 23.1554 45.3178C19.3072 43.2032 11.5612 38.9411 7.71847 36.821V28.3243L23.1554 36.821L25.7301 35.404L5.14381 24.0787V38.2436L23.1554 48.1518C24.9307 47.1742 39.8494 38.9631 41.1615 38.2381V32.5754L15.4369 18.4105L23.1554 14.1594ZM5.14381 15.5764V21.2446L30.8684 35.4095L23.1499 39.6606L10.2876 32.5644V35.4095L23.1499 42.4892C25.063 41.4346 34.3086 36.3432 36.0122 35.4095C34.4299 34.5362 17.8186 25.3914 7.71847 19.8276V16.9935C9.09126 16.2355 23.1554 8.49674 23.1554 8.49674C26.9981 10.6168 34.7441 14.8789 38.5924 16.9935V25.4902L23.1554 16.9935L20.5807 18.4105L41.1615 29.7413V15.5764L23.1554 5.66266C21.3746 6.6458 6.46146 14.8569 5.14381 15.5764ZM23.1554 0L0 12.7479V41.0721L23.1554 53.82L46.3108 41.0776V12.7479L23.1554 0ZM43.7306 39.6551L23.1554 50.9859L2.57466 39.6551V14.1649L23.1554 2.83408L43.7362 14.1649L43.7306 39.6551Z"
    />
  </svg>,
);

const neo4jIcon = icon(
  <svg aria-hidden="true" viewBox="10 120 100 110" role="img">
    <title>Neo4j</title>
    <path
      fill="currentColor"
      d="M24.6 125.8c-3 1.5-5.8 4-7.8 7.3-2 3.3-2.8 6.8-2.5 10.3.3 6.3 3.8 12.1 9.5 15.3 5.3 3 11.3 2.3 17 1 7-1.8 13-2.5 19.3 1.3 0 0 0 0 .3 0 10.8 6.3 10.8 22.1 0 28.4 0 0 0 0-.3 0-6.3 3.8-12.3 3-19.3 1.3-5.5-1.5-11.5-2.3-17 1-5.8 3.3-9 9.3-9.5 15.3-.3 3.5.5 7 2.5 10.3 2 3.3 4.5 5.8 7.8 7.3 5.5 2.8 12.3 2.8 18-.5 5.3-3 7.8-8.8 9.3-14.3 2-7 4.3-12.6 10.8-16.1 6.3-3.8 12.3-3 19.3-1.3 5.5 1.5 11.5 2.3 17-1 5.8-3.3 9-9.3 9.5-15.3 0-.5 0-.8 0-1.3 0-.5 0-.8 0-1.3-.3-6.3-3.8-12.1-9.5-15.3-5.3-3-11.3-2.3-17-1-7 1.8-13 2.5-19.3-1.3-6.3-3.8-8.8-9.1-10.8-16.1-1.5-5.5-4-11.1-9.3-14.3-5.8-3.3-12.5-3.3-18 0z"
    />
  </svg>,
);

export default defineDocs({
  entry: "docs",
  theme: pixelBorder({
    ui: {
      colors: {
        primary: "#d9f3ff",
        background: "#050505",
        muted: "#101113",
        border: "#23252a",
      },
      sidebar: { style: "floating" },
      layout: {
        contentWidth: 920,
        sidebarWidth: 296,
        toc: { enabled: true, depth: 3, style: "directional" },
      },
      typography: {
        font: {
          // h1: { size: "2.8rem", weight: 700, letterSpacing: "-0.05em" },
          // h2: { size: "1.72rem", weight: 600, letterSpacing: "-0.035em" },
          // h3: { size: "1.18rem", weight: 600 },
          // body: { size: "1rem", lineHeight: "1.8" },
        },
      },
    },
  }),
  nav: {
    title: (
      <div className="flex items-center gap-3 font-medium tracking-tight text-white">
        <div className="flex -mb-1 items-center gap-2">
          <span className="font-mono text-[11px] uppercase text-white/55">
            <code>@farming-labs/orm</code>
          </span>
        </div>
      </div>
    ),
    url: "/",
  },
  github: {
    url: "https://github.com/farming-labs/orm",
    directory: "website",
  },
  metadata: {
    titleTemplate: "%s - Farming Labs ORM",
    description:
      "Unified schema, generator-first tooling, and pixel-border documentation for @farming-labs/orm",
  },
  og: {
    enabled: true,
    type: "dynamic",
    endpoint: "/api/og",
  },
  feedback: {
    enabled: true,
    onFeedback: submitDocsFeedback,
  },
  breadcrumb: { enabled: true },
  pageActions: {
    // position: "above-title",
    alignment: "right",
    copyMarkdown: { enabled: true },
    openDocs: {
      enabled: true,
      providers: [
        {
          name: "GitHub",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          ),
          urlTemplate: "{githubUrl}",
        },
        {
          name: "ChatGPT",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4092-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0974-2.3616l2.603-1.5018 2.6032 1.5018v3.0036l-2.6032 1.5018-2.603-1.5018z" />
            </svg>
          ),
          urlTemplate: "https://chatgpt.com/?q=Read+this+documentation:+{url}",
        },
        {
          name: "Claude",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.709 15.955l4.397-10.985c.245-.648.245-.648.9-.648h2.756c.649 0 .649 0 .9.648l4.397 10.985c.232.569.232.569-.363.569h-2.392c-.636 0-.636 0-.874-.648l-.706-1.865H8.276l-.706 1.865c-.238.648-.238.648-.874.648H4.709c.245-.648-.363-.569-.363-.569z" />
              <path d="M15.045 6.891L12.289 0H14.61c.655 0 .655 0 .9.648l4.398 10.985c.231.569.231.569-.364.569h-2.391c-.637 0-.637 0-.875-.648z" />
            </svg>
          ),
          urlTemplate: "https://claude.ai/new?q=Read+this+documentation:+{url}",
        },
        {
          name: "Cursor",
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          ),
          urlTemplate: "https://cursor.com/link/prompt?text=Read+this+documentation:+{url}",
        },
      ],
    },
  },
  ordering: [
    { slug: "getting-started" },
    {
      slug: "schema",
      children: [{ slug: "fields" }, { slug: "relations" }],
    },
    {
      slug: "runtime",
      children: [{ slug: "query-api" }, { slug: "runtime-helpers" }, { slug: "memory-driver" }],
    },
    { slug: "cli" },
    {
      slug: "integrations",
      children: [
        { slug: "support-matrix" },
        { slug: "prisma" },
        { slug: "drizzle" },
        { slug: "kysely" },
        { slug: "mikroorm" },
        { slug: "typeorm" },
        { slug: "sequelize" },
        { slug: "sql-databases" },
        { slug: "edgedb" },
        { slug: "neo4j" },
        { slug: "surrealdb" },
        { slug: "cloudflare-d1" },
        { slug: "cloudflare-kv" },
        { slug: "redis" },
        { slug: "supabase" },
        { slug: "xata" },
        { slug: "firestore" },
        { slug: "dynamodb" },
        { slug: "unstorage" },
        { slug: "mongodb" },
      ],
    },
    {
      slug: "use-cases",
      children: [
        { slug: "framework-authors" },
        { slug: "multi-storage-walkthrough" },
        { slug: "auth-libraries" },
        { slug: "auth-adapter-ecosystem" },
        { slug: "billing-modules" },
        { slug: "fullstack-frameworks" },
        { slug: "internal-platforms" },
      ],
    },
  ],
  themeToggle: { enabled: false },
  icons: {
    book: icon(<BookOpen strokeWidth={1.5} />),
    rocket: icon(<Rocket strokeWidth={1.5} />),
    database: icon(<Database strokeWidth={1.5} />),
    braces: icon(<Braces strokeWidth={1.5} />),
    network: icon(<Network strokeWidth={1.5} />),
    neo4j: neo4jIcon,
    server: icon(<Server strokeWidth={1.5} />),
    boxes: icon(<Boxes strokeWidth={1.5} />),
    code: icon(<Code2 strokeWidth={1.5} />),
    package: icon(<Package strokeWidth={1.5} />),
    filecode: icon(<FileCode2 strokeWidth={1.5} />),
    prisma: brandIcon(siPrisma.path, siPrisma.title),
    drizzle: brandIcon(siDrizzle.path, siDrizzle.title),
    kysely: kyselyIcon,
    mikroorm: mikroormIcon,
    edgedb: edgedbIcon,
    typeorm: brandIcon(siTypeorm.path, siTypeorm.title),
    sequelize: brandIcon(siSequelize.path, siSequelize.title),
    cloudflare: brandIcon(siCloudflare.path, siCloudflare.title),
    redis: brandIcon(siRedis.path, siRedis.title),
    surrealdb: surrealdbIcon,
    mongodb: brandIcon(siMongodb.path, siMongodb.title),
    supabase: brandIcon(siSupabase.path, siSupabase.title),
    xata: xataIcon,
    firestore: brandIcon(siFirebase.path, siFirebase.title),
    dynamodb: dynamodbIcon,
    unstorage: brandIcon(siUnjs.path, siUnjs.title),
    harddrive: icon(<HardDrive strokeWidth={1.5} />),
    terminal: icon(<Terminal strokeWidth={1.5} />),
    users: icon(<Users strokeWidth={1.5} />),
    shield: icon(<ShieldCheck strokeWidth={1.5} />),
    card: icon(<CreditCard strokeWidth={1.5} />),
    building: icon(<Building2 strokeWidth={1.5} />),
    pin: icon(<Pin strokeWidth={1.5} />),
  },
  sidebar: {
    banner: (
      <div
        className="-mx-4 relative mt-2"
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-fd-border)",
          borderTop: "1px solid var(--color-fd-border)",
          fontSize: "13px",
          color: "var(--color-fd-muted-foreground)",
          backgroundImage:
            "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-fd-border) 2%, transparent), color-mix(in srgb, var(--color-fd-foreground) 7%, transparent) 1px, transparent 1px, transparent 6px)",
        }}
      >
        <div
          className="font-mono tracking-tighter"
          style={{ fontWeight: 600, marginBottom: 4, color: "var(--color-fd-foreground)" }}
        >
          <span style={{ opacity: 0.4 }}>
            <Pin size={12} className="inline-flex" />{" "}
          </span>
          <a
            href={`/changelogs#${latestChangelogEntry.anchor}`}
            className="lowercase cursor-pointer text-[12px] underline underline-offset-2 decoration-dotted transition-colors mr-1"
            style={{
              textDecorationColor:
                "color-mix(in srgb, var(--color-fd-foreground) 30%, transparent)",
            }}
          >
            {latestChangelogEntry.version}
          </a>
        </div>
        <span className="uppercase font-mono text-[9.5px] tracking-tight block">
          Read the latest release notes and runtime changes in the changelog.
        </span>
      </div>
    ),

    footer: (
      <div
        className="-mx-4 -my-2 -mb-4 flex flex-col gap-1 font-mono uppercase"
        style={{
          padding: "9px 16px",
          fontSize: "12px",
          backgroundImage:
            "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-fd-border) 7%, transparent), color-mix(in srgb, var(--color-fd-foreground) 5%, transparent) 1px, transparent 1px, transparent 6px)",
        }}
      >
        <div className="docs-sidebar-footer mb-2">
          <a href="/">Home</a>
          <a href="/docs/getting-started">Setup</a>
          <a href="/docs/runtime">Runtime</a>
          <a href="/docs/integrations">Integrations</a>
          <a href="/docs/use-cases">Use cases</a>
          <a href="/docs/cli">CLI</a>
          <a href="/docs/schema">Schema</a>
          <a href="/docs/relations">Relations</a>
        </div>
        <div className="docs-sidebar-credit-row text-white/80 opacity-80 flex border-t border-white/10 pb-1 pt-2 -mx-4 gap-2 items-center justify-center text-[10px] font-light font-mono uppercase">
          <Package size={14} className="inline-flex mb-px shrink-0" />
          <span>
            Built with{" "}
            <a
              href="https://github.com/farming-labs"
              target="_blank"
              rel="noreferrer"
              className="docs-sidebar-credit-link transition-colors"
            >
              @farming-labs
            </a>
          </span>
        </div>
      </div>
    ),
  },
});
