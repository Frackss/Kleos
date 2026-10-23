"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type {
  ContentDraft,
  Recommendation,
  Section,
  Snapshot,
} from "@/lib/types";
import { measure } from "@/lib/metrics";
import { Shell } from "./shell";
import { DataNotice, DashboardSkeleton } from "./shared";
import { Button } from "./ui/button";
import { Overview } from "./overview";
import { Discovery } from "./discovery";
import { Competitors } from "./competitors";
import { Recommendations } from "./recommendations";
import { ContentStudio } from "./content-studio";
import { Measurement } from "./measurement";
import { Settings } from "./settings";
async function loadDashboard(signal?: AbortSignal) {
  const response = await fetch("/api/dashboard", { cache: "no-store", signal });
  return { ok: response.ok, body: await response.json() };
}
export function Dashboard({ section }: { section: Section }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const receive = useCallback(
    ({ ok, body }: Awaited<ReturnType<typeof loadDashboard>>) => {
      if (!ok) {
        setError(body.error ?? "Could not load workspace.");
        return;
      }
      setData(body);
      setError("");
    },
    [],
  );
  const refresh = useCallback(async () => {
    try {
      receive(await loadDashboard());
    } catch {
      setError(
        "Could not load workspace. Check your connection and try again.",
      );
    }
  }, [receive]);
  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal)
      .then(receive)
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Could not load workspace. Check your connection and try again.",
          );
      });
    return () => controller.abort();
  }, [receive]);
  async function action(name: string, body?: unknown) {
    if (busy) return;
    setBusy(name);
    try {
      const response = await fetch(`/api/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Operation failed.");
      if (name === "scan") {
        toast.success(
          "Scan started. Results are saved as each query finishes.",
        );
      } else if (name === "audit")
        toast.success("Website audit saved. Review your recommendations.");
      else if (name === "draft")
        toast.success(
          "Template draft created. Review details before publishing.",
        );
      else if (name === "recommendation") toast.success("Action updated.");
      else if (name === "queries") toast.success("Query bank saved.");
      else if (name === "cancel")
        toast.success(
          "Cancellation requested. Completed results are retained.",
        );
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  const activeScan = data?.scans.find((s) => s.status === "running");
  const activeScanId = activeScan?.id;
  useEffect(() => {
    if (!activeScanId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const result = await loadDashboard(controller.signal);
        if (!stopped) receive(result);
      } catch {
        if (!stopped)
          setError(
            "Progress connection interrupted. Retrying; saved results are retained.",
          );
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeScanId, receive]);
  const measurements = data
    ? data.scans
        .flatMap((s) => {
          const m = measure(s, data.results);
          return m ? [m] : [];
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];
  return (
    <Shell section={section}>
      {error ? (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-[#f0d7ca] bg-[#fbefe8] p-4 text-sm text-terracotta"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            <RefreshCw />
            Retry
          </Button>
        </div>
      ) : null}
      {!data ? (
        error ? null : (
          <DashboardSkeleton />
        )
      ) : (
        <div className="page-enter">
          <DataNotice data={data} />
          {activeScan && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 rounded-xl border border-border bg-white p-4 text-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <span>
                  {activeScan.cancelRequested
                    ? "Stopping scan…"
                    : "Searching Perplexity Agent API…"}{" "}
                  {activeScan.completedCount ?? 0}/{activeScan.queryCount}{" "}
                  processed · {activeScan.successCount} valid
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy || activeScan.cancelRequested}
                  onClick={() => void action("cancel", { id: activeScan.id })}
                >
                  Cancel scan
                </Button>
              </div>
              <progress
                className="mt-3 h-2 w-full accent-primary"
                value={activeScan.completedCount ?? 0}
                max={activeScan.queryCount}
                aria-label="Scan progress"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Each response is saved immediately. Failed, cancelled and
                unverified queries are excluded from metrics.
              </p>
            </div>
          )}
          {section === "overview" && (
            <Overview
              data={data}
              measurements={measurements}
              busy={Boolean(busy) || Boolean(activeScan)}
              onScan={() => void action("scan")}
            />
          )}
          {section === "discovery" && (
            <Discovery
              data={data}
              busy={Boolean(busy) || Boolean(activeScan)}
              onScan={(count, queryIds) =>
                void action("scan", { count, queryIds })
              }
              onSaveQueries={(queries) => void action("queries", { queries })}
            />
          )}
          {section === "competitors" && (
            <Competitors
              data={data}
              latest={measurements.at(-1)}
              busy={Boolean(busy) || Boolean(activeScan)}
              onScan={() => void action("scan")}
            />
          )}
          {section === "recommendations" && (
            <Recommendations
              auditing={busy === "audit"}
              data={data}
              busy={Boolean(busy) || Boolean(activeScan)}
              onAudit={() => void action("audit")}
              onUpdate={(id: string, status: Recommendation["status"]) =>
                void action("recommendation", { id, status })
              }
            />
          )}
          {section === "studio" && (
            <ContentStudio
              data={data}
              busy={Boolean(busy) || Boolean(activeScan)}
              onCreate={(kind: ContentDraft["kind"]) =>
                void action("draft", { kind })
              }
            />
          )}
          {section === "measurement" && (
            <Measurement data={data} measurements={measurements} />
          )}
          {section === "settings" && <Settings data={data} />}
        </div>
      )}
    </Shell>
  );
}
