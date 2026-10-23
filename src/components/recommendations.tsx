"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Circle,
  ClipboardCheck,
  Globe2,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import type { Recommendation, Snapshot } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { Badge, EmptyState, PageHeading } from "./shared";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
export function Recommendations({
  data,
  busy,
  auditing,
  onAudit,
  onUpdate,
}: {
  data: Snapshot;
  busy: boolean;
  auditing: boolean;
  onAudit: () => void;
  onUpdate: (id: string, status: Recommendation["status"]) => void;
}) {
  const [filter, setFilter] = useState("open");
  const recommendations = data.recommendations.filter(
    (r) =>
      !(r.id === "setup-scan" && data.scans.some((s) => s.successCount > 0)) &&
      !(r.id === "setup-audit" && data.audits.length),
  );
  const shown = recommendations.filter(
    (r) => filter === "all" || r.status === filter,
  );
  const audit = data.audits[0];
  return (
    <>
      <PageHeading
        title="Small changes. Better discovery."
        description="An evidence-led action plan for your restaurant’s AI search presence."
        action={
          <Button onClick={onAudit} disabled={busy}>
            {auditing ? <LoaderCircle className="animate-spin" /> : <Globe2 />}
            {auditing ? "Analyzing homepage…" : "Analyze website"}
          </Button>
        }
      />
      <div
        className="mb-5 flex gap-2"
        role="group"
        aria-label="Filter recommendations"
      >
        {["open", "done", "all"].map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "secondary" : "ghost"}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f === "open"
              ? "To do"
              : f === "done"
                ? "Completed"
                : "All actions"}
            {f === "open" && (
              <span className="ml-1 opacity-60">
                {recommendations.filter((r) => r.status === "open").length}
              </span>
            )}
          </Button>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          {shown.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() =>
                      onUpdate(r.id, r.status === "done" ? "open" : "done")
                    }
                    disabled={busy}
                    aria-label={
                      r.status === "done"
                        ? `Reopen ${r.title}`
                        : `Mark ${r.title} complete`
                    }
                    className="mt-0.5 rounded-md p-0.5 text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
                  >
                    {r.status === "done" ? (
                      <Check className="size-5" />
                    ) : (
                      <Circle className="size-5 text-[#b4ad9d]" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Badge tone={r.priority === "high" ? "amber" : "neutral"}>
                        {r.priority} priority
                      </Badge>
                      <Badge>{r.category}</Badge>
                      <Badge tone="blue">
                        {r.source === "setup"
                          ? "Getting started"
                          : `${r.source} evidence`}
                      </Badge>
                    </div>
                    <h2
                      className={`text-sm font-semibold ${r.status === "done" ? "text-muted-foreground line-through" : ""}`}
                    >
                      {r.title}
                    </h2>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                      {r.description}
                    </p>
                    <details className="mt-4 text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer font-medium">
                        Why this action?
                      </summary>
                      <p className="mt-2 rounded-md bg-muted p-3 leading-relaxed">
                        {r.evidence}
                      </p>
                    </details>
                    {r.id === "setup-scan" && (
                      <Link
                        href="/discovery"
                        className="mt-4 inline-flex items-center gap-1 text-xs text-primary"
                      >
                        Explore discovery
                        <ArrowUpRight className="size-3" />
                      </Link>
                    )}
                    {r.category === "Website" && (
                      <Link
                        href="/studio"
                        className="mt-4 inline-flex items-center gap-1 text-xs text-primary"
                      >
                        Create supporting content
                        <ArrowUpRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!shown.length && (
            <Card>
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing on this list"
                description="Complete an action or run a fresh audit to update your recommendations."
              />
            </Card>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Website signals</CardTitle>
            <Globe2 className="size-4 text-muted-foreground" />
          </CardHeader>
          {audit ? (
            <CardContent>
              <p className="mb-5 text-[11px] text-muted-foreground">
                Last audited {dateLabel(audit.createdAt)}
              </p>
              <div className="space-y-4">
                {audit.checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2.5">
                    {c.passed ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-olive" />
                    ) : (
                      <Circle className="mt-0.5 size-3.5 shrink-0 text-[#8a5a10]" />
                    )}
                    <div>
                      <p className="text-xs font-medium">{c.label}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        {c.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground">
                Live homepage HTML only. JavaScript-rendered content, other
                pages, and third-party listings are not evaluated.
              </p>
            </CardContent>
          ) : (
            <EmptyState
              icon={Globe2}
              title="Let’s look under the hood"
              description="Run a website analysis to check the homepage’s discoverability signals. No audit findings have been assumed."
              compact
            />
          )}
        </Card>
      </div>
    </>
  );
}
