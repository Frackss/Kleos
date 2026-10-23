"use client";
import { Download, History } from "lucide-react";
import type { Measurement as MeasurementType, Snapshot } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { Badge, EmptyState, PageHeading } from "./shared";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { TrendChart } from "./trend-chart";
export function Measurement({
  data,
  measurements,
}: {
  data: Snapshot;
  measurements: MeasurementType[];
}) {
  function exportCsv() {
    const rows = [
      [
        "Date",
        "Visibility score",
        "Mention rate (%)",
        "Average position",
        "Share of voice (%)",
        "Successful queries",
        "Total queries",
        "Query set",
      ],
      ...measurements.map((m) => [
        m.createdAt,
        m.visibilityScore,
        m.mentionRate,
        m.averagePosition ?? "",
        m.shareOfVoice.toFixed(2),
        m.successfulQueries,
        m.totalQueries,
        m.querySet,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(",")).join("\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kleos-measurements.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        title="Measure what changes"
        description="Build a real baseline, make improvements, and track your next scan."
        action={
          <Button
            variant="outline"
            disabled={!measurements.length}
            onClick={exportCsv}
          >
            <Download />
            Export CSV
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>AI visibility history</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">
              {measurements.length} measured scans · no synthetic history
            </p>
          </div>
          <Badge tone="blue">0–100</Badge>
        </CardHeader>
        <TrendChart measurements={measurements} />
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Scan log</CardTitle>
          <History className="size-4 text-muted-foreground" />
        </CardHeader>
        {data.scans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-y border-border bg-muted/50 text-muted-foreground">
                <tr>
                  {[
                    "Started",
                    "Status",
                    "Coverage",
                    "Visibility",
                    "Mention rate",
                  ].map((h) => (
                    <th key={h} className="px-6 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.scans.map((s) => {
                  const m = measurements.find((m) => m.scanId === s.id);
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        {dateLabel(s.startedAt)}
                      </td>
                      <td className="px-6">
                        <Badge
                          tone={
                            s.status === "completed"
                              ? "green"
                              : s.status === "failed"
                                ? "red"
                                : "amber"
                          }
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-6">
                        {s.successCount}/{s.queryCount}
                      </td>
                      <td className="px-6">
                        {m ? `${m.visibilityScore}/100` : "—"}
                      </td>
                      <td className="px-6">{m ? `${m.mentionRate}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={History}
            title="A clean starting point"
            description="Every scan you run will appear here with its timestamp, coverage, and measured results."
            compact
          />
        )}
      </Card>
      <Card className="mt-6" id="methodology">
        <CardHeader>
          <CardTitle>Transparent by design</CardTitle>
          <Badge>Scoring methodology</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {[
              {
                title: "AI Visibility Score",
                text: "100 × mean reciprocal rank across successful queries. A #1 appearance contributes 100, #2 contributes 50, and absence or an unranked mention contributes 0. This is a directional score for this query set, not a universal SEO score.",
              },
              {
                title: "Mention rate",
                text: "Target appearances in verified recommendation lists divided by valid completed queries. Failed, cancelled and unverified answers are excluded; original responses remain available in AI Discovery.",
              },
              {
                title: "Average position",
                text: "The mean explicit recommendation position among responses where Café Athena is ranked. Missing and unranked mentions are excluded. A dash means no ranked appearances, not position zero.",
              },
              {
                title: "Share of voice",
                text: "A restaurant’s deduplicated mentions divided by all detected restaurant mentions in the same scan. The Overview shows Café Athena’s share; competitor bars show the percentage of successful answers naming each restaurant.",
              },
              {
                title: "Fair comparisons",
                text: "Compare the same query set and provider. Partial scans have different coverage and should be compared cautiously. AI answers are nondeterministic; improvements do not establish causality.",
              },
              {
                title: "Source boundaries",
                text: "Search metrics come only from real provider responses. Website audits inspect fetched homepage HTML. Supplied profile details and template drafts are labeled separately. No historical results are seeded.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-xs font-semibold">{item.title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
