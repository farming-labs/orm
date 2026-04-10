import { ArrowUpRight, Blocks, Command, PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const mcpEndpoint = "https://orm.farming-labs.dev/api/docs/mcp";

const cursorInstallUrl =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=farming-labs-orm-docs&config=eyJ1cmwiOiJodHRwczovL29ybS5mYXJtaW5nLWxhYnMuZGV2L2FwaS9kb2NzL21jcCJ9";

const claudeCodeCommand = `claude mcp add --transport http farming-labs-orm-docs ${mcpEndpoint}`;

const genericConfig = `{
  "mcpServers": {
    "farming-labs-orm-docs": {
      "url": "${mcpEndpoint}"
    }
  }
}`;

const clientLabels = ["Cursor", "Claude Code", "Windsurf", "Cline", "VS Code"];

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
              Add the ORM docs to your MCP client with one hosted endpoint
            </h2>

            <p className="mt-4 max-w-md text-sm leading-7 text-white/58">
              Cursor can install it in one click. Other MCP clients can point to the same remote
              HTTP endpoint and use the docs for page lookup, search, and navigation.
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
                className="inline-flex items-center gap-2 border border-[#d9f3ff]/20 bg-[#d9f3ff]/8 px-4 py-2 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-[#d9f3ff] transition-colors hover:bg-[#d9f3ff]/12"
              >
                Add to Cursor
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden />
              </a>
              <a
                href={mcpEndpoint}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-white/10 px-4 py-2 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-white/72 transition-colors hover:bg-white/[0.04]"
              >
                Open endpoint
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden />
              </a>
            </div>
          </div>

          <div className="grid gap-5 p-5 md:p-6">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-white/72">
                <Blocks className="size-4" strokeWidth={1.5} aria-hidden />
                <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Endpoint</p>
              </div>
              <pre className="overflow-x-auto border border-white/10 bg-black/30 px-4 py-3 font-mono text-[0.7rem] leading-6 text-white/82">
                <code>{mcpEndpoint}</code>
              </pre>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-white/72">
                  <Command className="size-4" strokeWidth={1.5} aria-hidden />
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Claude Code</p>
                </div>
                <pre className="overflow-x-auto border border-white/10 bg-black/30 px-4 py-3 font-mono text-[0.68rem] leading-6 text-white/82">
                  <code>{claudeCodeCommand}</code>
                </pre>
              </div>

              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-white/72">
                  <Blocks className="size-4" strokeWidth={1.5} aria-hidden />
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]">
                    Generic config
                  </p>
                </div>
                <pre className="overflow-x-auto border border-white/10 bg-black/30 px-4 py-3 font-mono text-[0.68rem] leading-6 text-white/82">
                  <code>{genericConfig}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
