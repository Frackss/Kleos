"use client";
import { UsersRound } from "lucide-react";
import type { Measurement, Snapshot } from "@/lib/types";
import { competitorsFor } from "@/lib/metrics";
import { Badge, EmptyState, PageHeading, ScanButton } from "./shared";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
export function Competitors({
  data,
  latest,
  busy,
  onScan,
}: {
  data: Snapshot;
  latest?: Measurement;
  busy: boolean;
  onScan: () => void;
}) {
  const competitors = competitorsFor(
    data.results.filter((r) => r.scanId === latest?.scanId),
  );
  return (
    <>
      <PageHeading
        title="The local competitive picture"
        description="See which restaurants share the conversation when diners ask AI where to eat."
        action={<ScanButton busy={busy} onScan={onScan} />}
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Share of voice</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">
              Observed mentions across your latest measured scan
            </p>
          </div>
          <Badge>{competitors.length} restaurants</Badge>
        </CardHeader>
        {competitors.length ? (
          <CardContent>
            <div className="mt-5 space-y-6">
              {competitors.map((c, i) => (
                <div key={c.name}>
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-medium">{c.name}</h3>
                    {c.isTarget && <Badge tone="blue">Your restaurant</Badge>}
                    <span className="ml-auto text-sm font-semibold">
                      {c.shareOfVoice.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${c.isTarget ? "bg-primary" : "bg-[#7fa6f0]"}`}
                      style={{ width: `${c.shareOfVoice}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {c.mentions} query mentions ·{" "}
                    {c.averagePosition
                      ? `Average position #${c.averagePosition.toFixed(1)}`
                      : "No explicit rank"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-8 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Each restaurant counts once per successful query. Share of voice
              is its mention count divided by all observed restaurant mentions.
              These are model-suggested competitors, not verified business
              listings.
            </p>
          </CardContent>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="Your competition, revealed by real search"
            description="After your first successful scan, restaurants named in AI responses will appear here. No competitors have been prefilled."
          />
        )}
      </Card>
    </>
  );
}
