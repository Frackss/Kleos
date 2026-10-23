import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getRepository } from "@/lib/repositories/repository";
import {
  AgentSearchService,
  SearchProviderError,
  searchModelLabel,
  type SearchService,
} from "./search";
import type { QueryResult, ScanRun, Recommendation } from "@/lib/types";

const controllers = globalThis as unknown as {
  localLensControllers?: Map<string, AbortController>;
};
const running = () => (controllers.localLensControllers ??= new Map());
export async function startScan(count = 12, queryIds?: string[], baselineScanId?: string) {
  if (!process.env.PERPLEXITY_API_KEY)
    throw new Error(
      "Live search is not connected. Add PERPLEXITY_API_KEY and restart.",
    );
  const repo = getRepository();
  const data = await repo.read();
  const baseline = baselineScanId ? data.scans.find((scan) => scan.id === baselineScanId) : undefined;
  if (baselineScanId && !baseline) throw new Error("Baseline scan not found.");
  const requestedIds = baseline?.queries?.map((query) => query.id) ?? queryIds;
  const enabled = data.queries.filter((q) => q.enabled && (!requestedIds || requestedIds.includes(q.id)));
  const queries = requestedIds
    ? requestedIds.flatMap((id) => enabled.filter((query) => query.id === id))
    : enabled.slice(0, count);
  if (queries.length !== count)
    throw new Error(
      `This scan needs ${count} active queries; only ${queries.length} are available in the selection.`,
    );
  const scan: ScanRun = {
    id: randomUUID(),
    restaurantId: data.restaurant.id,
    status: "running",
    startedAt: new Date().toISOString(),
    queryCount: queries.length,
    successCount: 0,
    completedCount: 0,
    queries,
    source: "live",
    model: searchModelLabel(),
    queryBankVersion: createHash("sha256").update(JSON.stringify(queries.map((query) => [query.id, query.text]))).digest("hex").slice(0, 16),
    baselineScanId,
    querySet: createHash("sha256")
      .update(
        JSON.stringify({
          provider: "perplexity-agent",
          configuration: searchModelLabel(),
          queries: queries.map((q) => [q.id, q.text]).sort(),
        }),
      )
      .digest("hex")
      .slice(0, 16),
  };
  await repo.startScan(scan);
  return scan;
}
export async function cancelScan(id: string) {
  await getRepository().cancelScan(id);
  running().get(id)?.abort();
}
export async function executeScan(
  scan: ScanRun,
  search: SearchService = new AgentSearchService(),
) {
  const repo = getRepository();
  const controller = new AbortController();
  running().set(scan.id, controller);
  const initial = (await repo.read()).scans.find((s) => s.id === scan.id);
  if (initial?.cancelRequested || initial?.status !== "running")
    controller.abort();
  const deadline = setTimeout(() => controller.abort(), 270_000);
  let cancellationCheck = false;
  const monitor = setInterval(async () => {
    if (cancellationCheck) return;
    cancellationCheck = true;
    try {
      const current = (await repo.read()).scans.find((s) => s.id === scan.id);
      if (current?.cancelRequested || current?.status !== "running")
        controller.abort();
    } catch {
      controller.abort();
    } finally {
      cancellationCheck = false;
    }
  }, 1500);
  let next = 0;
  let fatal: string | undefined;
  const queries = scan.queries ?? [];
  async function worker() {
    while (next < queries.length && !controller.signal.aborted) {
      const query = queries[next++];
      const base = {
        id: randomUUID(),
        restaurantId: scan.restaurantId,
        scanId: scan.id,
        queryId: query.id,
        query: query.text,
        queryCategory: query.category ?? query.intent,
        model: searchModelLabel(),
        parseVersion: 2,
      };
      let result: QueryResult;
      try {
        result = {
          ...base,
          ...(await search.search(query.text, controller.signal)),
          createdAt: new Date().toISOString(),
        };
      } catch (error) {
        result = {
          ...base,
          status: controller.signal.aborted ? "cancelled" : "failed",
          answer: "",
          rawResponse:
            error instanceof SearchProviderError
              ? error.rawResponse
              : undefined,
          citations: [],
          mentions: [],
          createdAt: new Date().toISOString(),
          error: controller.signal.aborted
            ? "Request interrupted; not measured."
            : error instanceof Error
              ? error.message
              : "Search failed.",
        };
      }
      try {
        await repo.saveResult(result);
      } catch (error) {
        fatal =
          error instanceof Error ? error.message : "Result persistence failed.";
        controller.abort();
      }
    }
  }
  try {
    await Promise.all([worker(), worker()]);
    const data = await repo.read();
    const current = data.scans.find((s) => s.id === scan.id);
    const results = data.results.filter((r) => r.scanId === scan.id);
    const successCount = results.filter((r) => r.status === "success").length;
    const finished: ScanRun = {
      ...scan,
      successCount,
      completedCount: results.length,
      completedAt: new Date().toISOString(),
      cancelRequested: current?.cancelRequested,
      status: current?.cancelRequested
        ? "cancelled"
        : successCount === queries.length
          ? "completed"
          : results.some(
                (r) => r.status !== "failed" && r.status !== "cancelled",
              )
            ? "partial"
            : "failed",
      error:
        fatal ??
        (controller.signal.aborted && !current?.cancelRequested
          ? "Scan time limit reached. Saved results are retained; unprocessed queries are not measured."
          : undefined),
    };
    const misses = results.filter(
      (r) => r.status === "success" && !r.mentions.some((m) => m.isTarget),
    );
    const recommendations: Recommendation[] = misses.length
      ? [
          {
            id: "scan-content-gap",
            restaurantId: scan.restaurantId,
            title: "Address the dining needs where you were absent",
            description:
              "Review these original answers and add accurate information about relevant dining options to your website. Rerun the same queries to compare samples.",
            category: "AI discovery",
            priority: "high",
            source: "scan",
            status: "open",
            evidence: `Absent from ${misses.length} of ${successCount} valid responses on ${finished.completedAt}. Queries: ${misses.map((r) => r.query).join(" • ")}`,
          },
        ]
      : [];
    await repo.finishScan(finished, [], recommendations);
    return finished;
  } finally {
    clearInterval(monitor);
    clearTimeout(deadline);
    running().delete(scan.id);
  }
}
// Blocking entry point for integration tests and local scripts; HTTP uses after().
export async function runScan(
  search: SearchService = new AgentSearchService(),
  count = 12,
) {
  return executeScan(await startScan(count), search);
}

export async function expireInterruptedScans() {
  const repo = getRepository();
  const data = await repo.read();
  for (const scan of data.scans.filter(
    (s) =>
      s.status === "running" && Date.now() - Date.parse(s.startedAt) > 300_000,
  )) {
    const results = data.results.filter((r) => r.scanId === scan.id);
    await repo.finishScan(
      {
        ...scan,
        status: scan.cancelRequested
          ? "cancelled"
          : results.length
            ? "partial"
            : "failed",
        completedAt: new Date().toISOString(),
        successCount: results.filter((r) => r.status === "success").length,
        completedCount: results.length,
        error:
          "Scan worker stopped before completion. Saved results retained; remaining queries were not measured.",
      },
      [],
      [],
    );
  }
}
