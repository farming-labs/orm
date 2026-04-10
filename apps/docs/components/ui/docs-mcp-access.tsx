import { Blocks, Code2, PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const mcpEndpoint = "https://orm.farming-labs.dev/api/docs/mcp";

const cursorInstallUrl =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=farming-labs-orm-docs&config=eyJ1cmwiOiJodHRwczovL29ybS5mYXJtaW5nLWxhYnMuZGV2L2FwaS9kb2NzL21jcCJ9";

const vscodeInstallUrl = `vscode:mcp/install?${encodeURIComponent(
  JSON.stringify({
    name: "farming-labs-orm-docs",
    type: "http",
    url: mcpEndpoint,
  }),
)}`;

const clientLabels = ["Cursor", "VS Code"];

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 167 191" className={className} fill="none" role="img">
      <path
        fill="#72716D"
        d="M83.395 95.5 166 143.297c-.507.881-1.243 1.633-2.155 2.159L86.636 190.13c-2.004 1.16-4.477 1.16-6.482 0l-77.209-44.674c-.911-.526-1.648-1.278-2.155-2.159L83.395 95.5Z"
      />
      <path
        fill="#55544F"
        d="M83.395 0v95.5L.79 143.297A4.302 4.302 0 0 1 0 140.346V50.654c0-2.109 1.122-4.054 2.945-5.11L80.15.87A6.48 6.48 0 0 1 83.391 0h.004Z"
      />
      <path
        fill="#43413C"
        d="M165.996 47.703a6.452 6.452 0 0 0-2.155-2.159L86.632.87A6.477 6.477 0 0 0 83.395 0v95.5L166 143.297a4.302 4.302 0 0 0 .789-2.951V50.654A5.88 5.88 0 0 0 166 47.703h-.004Z"
      />
      <path
        fill="#D6D5D2"
        d="M160.218 51.049c.468.809.533 1.847 0 2.771L85.235 183.974c-.503.881-1.843.519-1.843-.495V97.713c0-.684-.183-1.343-.515-1.919l77.338-44.749h.003Z"
      />
      <path
        fill="#fff"
        d="m160.218 51.049-77.338 44.748a5.129 5.129 0 0 0-1.4-1.403L7.369 51.511c-.879-.505-.518-1.848.493-1.848h149.962c1.065 0 1.93.576 2.394 1.386Z"
      />
    </svg>
  );
}

export function DocsMcpAccess({ className }: { className?: string }) {
  return (
    <section className={cn("not-prose py-6 md:py-8", className)} aria-label="MCP access">
      <Card className="relative overflow-hidden border-white/10 bg-muted/75">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-45deg,rgba(255,255,255,0.035),rgba(255,255,255,0.035)_1px,transparent_1px,transparent_10px)] opacity-60" />
        <div className="relative grid gap-0 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="border-b border-white/10 p-5 md:border-b-0 md:border-r md:p-6">
            <div className="inline-flex items-center gap-2 text-white/70">
              <PlugZap className="size-4" strokeWidth={1.5} aria-hidden />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Docs MCP</p>
            </div>

            <h2 className="mt-4 max-w-sm font-mono text-[0.9rem] uppercase tracking-[0.12em] text-white/92 sm:text-[0.98rem]">
              Add the ORM docs with a native MCP install link
            </h2>

            <p className="mt-4 max-w-md text-sm leading-7 text-white/58">
              This hosted MCP endpoint currently exposes direct install links for Cursor and VS
              Code, so the docs server can be added without copying config by hand.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {clientLabels.map((label) => (
                <span
                  key={label}
                  className="border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-white/55"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={cursorInstallUrl}
                className="group inline-flex min-h-12 items-center gap-3 border border-white/12 bg-white/[0.045] px-3 py-3 text-white transition-[border-color,background-color] hover:border-white/20 hover:bg-white/[0.07]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center border border-white/12 bg-black/35">
                  <CursorIcon className="size-4.5" />
                </span>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-white/45">
                    one click
                  </span>
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/92">
                    Add to Cursor
                  </span>
                </span>
                <span className="ml-1 border border-white/10 bg-black/25 px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-white/52 transition-colors group-hover:text-white/72">
                  MCP
                </span>
              </a>
              <a
                href={vscodeInstallUrl}
                className="group inline-flex min-h-12 items-center gap-3 border border-white/12 bg-white/[0.045] px-3 py-3 text-white transition-[border-color,background-color] hover:border-white/20 hover:bg-white/[0.07]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center border border-white/12 bg-black/35">
                  <Code2 className="size-4 text-[#0078d4]" strokeWidth={1.7} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-white/45">
                    one click
                  </span>
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/92">
                    Add to VS Code
                  </span>
                </span>
                <span className="ml-1 border border-white/10 bg-black/25 px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-white/52 transition-colors group-hover:text-white/72">
                  MCP
                </span>
              </a>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:p-6">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-white/72">
                <Blocks className="size-4" strokeWidth={1.5} aria-hidden />
                <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Remote URL</p>
              </div>
              <pre className="overflow-x-auto border border-white/10 bg-black/30 px-4 py-3 font-mono text-[0.7rem] leading-6 text-white/82">
                <code>{mcpEndpoint}</code>
              </pre>
            </div>

            <p className="max-w-md text-sm leading-7 text-white/54">
              Both buttons install the same hosted HTTP MCP server. For VS Code Insiders, use the
              same install URL with the `vscode-insiders:` scheme.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
