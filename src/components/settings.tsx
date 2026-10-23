import { Check, ExternalLink, PlugZap, Server } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { Badge, PageHeading } from "./shared";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
export function Settings({ data }: { data: Snapshot }) {
  const r = data.restaurant;
  return (
    <>
      <PageHeading
        title="Your restaurant, connected"
        description="Manage the foundations of your Kleos workspace."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Restaurant profile</CardTitle>
              <Badge tone="amber">Supplied · unverified</Badge>
            </CardHeader>
            <CardContent>
              <div className="mb-6 flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-xl bg-[#ede7db] font-serif text-2xl text-[#1e4fa3]">
                  A
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {r.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.cuisine} · Since {r.opened}
                  </p>
                </div>
              </div>
              <dl className="space-y-4 text-xs">
                <div className="grid gap-1 sm:grid-cols-[110px_1fr]">
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="leading-relaxed">{r.address}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[110px_1fr]">
                  <dt className="text-muted-foreground">Neighborhood</dt>
                  <dd>{r.neighborhood}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[110px_1fr]">
                  <dt className="text-muted-foreground">Website</dt>
                  <dd>
                    <a
                      className="inline-flex items-center gap-1 text-primary"
                      href={r.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      cafeathena.com
                      <ExternalLink className="size-3" />
                    </a>
                  </dd>
                </div>
              </dl>
              <h3 className="mt-7 text-xs font-semibold">Dining highlights</h3>
              <div className="mt-3 space-y-2.5">
                {r.highlights.map((h) => (
                  <p
                    key={h}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-3 shrink-0 text-[#1e4fa3]" />
                    {h}
                  </p>
                ))}
              </div>
              <p className="mt-6 rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                This demo profile comes from supplied information, not a live
                business audit. Confirm details with the restaurant before
                publishing. Profile editing is outside this pilot’s scope.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connections</CardTitle>
              <PlugZap className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="border-b border-border pb-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold">
                    Perplexity Agent API
                  </h3>
                  <Badge tone={data.config.sonar ? "green" : "neutral"}>
                    {data.config.sonar ? "Key configured" : "Not connected"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Real web-grounded AI search. A configured key is verified when
                  you run your first scan.
                </p>
                <code className="mt-3 block break-all rounded-md bg-muted p-2 text-[10px] text-[#4a5170]">
                  PERPLEXITY_API_KEY
                </code>
              </div>
              <div className="pt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold">Supabase PostgreSQL</h3>
                  <Badge
                    tone={
                      data.config.persistence === "supabase" ? "green" : "amber"
                    }
                  >
                    {data.config.persistence === "supabase"
                      ? "Connected"
                      : "Temporary memory"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  {data.config.persistence === "supabase"
                    ? "Scans, audits, actions, and drafts are persisted to your database."
                    : "Changes are stored only in this server process and can disappear on restart. Connect Supabase for durable storage."}
                </p>
                <code className="mt-3 block break-all rounded-md bg-muted p-2 text-[10px] leading-5 text-[#4a5170]">
                  SUPABASE_URL
                  <br />
                  SUPABASE_SERVICE_ROLE_KEY
                </code>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Connect your environment</CardTitle>
              <Server className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-xs leading-6 text-muted-foreground">
                <li>
                  <span className="mr-2 text-primary">01</span>Copy{" "}
                  <code>.env.example</code> to <code>.env.local</code> and add
                  server credentials.
                </li>
                <li>
                  <span className="mr-2 text-primary">02</span>Run the SQL
                  migrations in order in your Supabase project (initial schema,
                  then discovery).
                </li>
                <li>
                  <span className="mr-2 text-primary">03</span>Supabase is used
                  only for PostgreSQL and its backend data API. No user accounts
                  or sign-in configuration are needed.
                </li>
                <li>
                  <span className="mr-2 text-primary">04</span>Restart or
                  redeploy, then run your first scan.
                </li>
              </ol>
              <p className="mt-4 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground">
                Secrets stay on the server. This page shows configuration status
                only. See the repository README for the complete setup.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
