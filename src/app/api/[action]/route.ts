import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { discoveryCsv } from "@/lib/export";
import { comparisonCsv } from "@/lib/comparison";
import { getRepository, hasSupabase } from "@/lib/repositories/repository";
import {
  startScan,
  executeScan,
  cancelScan,
  expireInterruptedScans,
} from "@/lib/services/scan";
import { CheerioAuditService } from "@/lib/services/audit";
import { SonarContentService } from "@/lib/services/content";
import { verifyPublication } from "@/lib/services/publish";
import { runSandboxExperiment } from "@/lib/services/sandbox";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
function isSameOrigin(origin: string, host: string | null, protocol: string) {
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === protocol;
  } catch {
    return false;
  }
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (action !== "dashboard" && action !== "export")
    return json({ error: "Not found." }, 404);
  try {
    await expireInterruptedScans();
    const data = await getRepository().read();
    data.results = data.results.map((r) =>
      r.status === "success" && r.parseVersion !== 2
        ? {
            ...r,
            status: "unverified" as const,
            error:
              "Legacy extraction: rerun this query to verify its recommendation list. Original response retained.",
          }
        : r,
    );
    data.scans = data.scans.map((s) => ({
      ...s,
      successCount: data.results.filter(
        (r) => r.scanId === s.id && r.status === "success",
      ).length,
    }));
    if (action === "export") {
      const beforeId = _request.nextUrl.searchParams.get("before");
      const afterId = _request.nextUrl.searchParams.get("after");
      if (beforeId && afterId) {
        const before = data.scans.find((scan) => scan.id === beforeId);
        const after = data.scans.find((scan) => scan.id === afterId);
        if (!before || !after) return json({ error: "Scan not found." }, 404);
        return new NextResponse(comparisonCsv(before, after, data.results), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kleos-comparison-${before.id}-${after.id}.csv"`, "Cache-Control": "no-store" } });
      }
      const id = _request.nextUrl.searchParams.get("scanId");
      const category = _request.nextUrl.searchParams.get("category") ?? "all";
      if (!id || !data.scans.some((s) => s.id === id))
        return json({ error: "Scan not found." }, 404);
      const rows = data.results.filter(
        (r) =>
          r.scanId === id &&
          (category === "all" || r.queryCategory === category),
      );
      return new NextResponse(discoveryCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="kleos-${id}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return json({
      ...data,
      config: {
        persistence: hasSupabase() ? "supabase" : "memory",
        sonar: Boolean(process.env.PERPLEXITY_API_KEY),
      },
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load workspace.",
      },
      503,
    );
  }
}
const actionSchemas = {
  draft: z.object({ kind: z.enum(["about", "faq", "schema", "menu", "landing", "outreach", "description"]), recommendationId: z.string().max(120).optional(), regenerateOf: z.string().uuid().optional() }),
  draftUpdate: z.object({ id: z.string().uuid(), body: z.string().max(40_000).optional(), approve: z.boolean().optional(), event: z.enum(["copied", "exported"]).optional() }).strict(),
  publishFix: z.object({ recommendationId: z.string().max(120).optional() }).strict(),
  verifyPublication: z.object({ id: z.string().uuid(), url: z.string().url().max(2000) }).strict(),
  recheckPublication: z.object({ id: z.string().uuid() }).strict(),
  sandboxTest: z.object({ id: z.string().uuid() }).strict(),
  recommendation: z.object({
    id: z.string().min(1).max(100),
    status: z.enum(["open", "done"]),
  }),
};
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  const origin = request.headers.get("origin");
  if (
    !origin ||
    !isSameOrigin(origin, request.headers.get("host"), request.nextUrl.protocol)
  )
    return json({ error: "Cross-origin request rejected." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 16_384)
    return json({ error: "Request too large." }, 413);
  try {
    if (action === "scan") {
      const body = z
        .object({
          count: z
            .union([z.literal(5), z.literal(12), z.literal(30)])
            .default(12),
          queryIds: z
            .array(z.string().min(1).max(80))
            .min(1)
            .max(30)
            .optional(),
          baselineScanId: z.string().uuid().optional(),
        })
        .strict()
        .parse(await request.json());
      const scan = await startScan(body.count, body.queryIds, body.baselineScanId);
      after(async () => {
        try {
          await executeScan(scan);
        } catch {
          console.error(
            "Scan worker failed; saved query results remain available. Scan ID:",
            scan.id,
          );
        }
      });
      return json(scan, 202);
    }
    if (action === "cancel") {
      const { id } = z
        .object({ id: z.string().uuid() })
        .strict()
        .parse(await request.json());
      await cancelScan(id);
      return json({ ok: true });
    }
    if (action === "queries") {
      const body = z
        .object({
          queries: z
            .array(
              z
                .object({
                  id: z.string().min(1).max(80),
                  text: z.string().trim().min(8).max(300),
                  category: z.string().trim().min(1).max(80),
                  active: z.boolean(),
                })
                .strict(),
            )
            .min(1)
            .max(30),
        })
        .strict()
        .parse(await request.json());
      const repo = getRepository();
      const data = await repo.read();
      if (data.scans.some((s) => s.status === "running"))
        return json(
          { error: "Wait for the active scan before editing queries." },
          409,
        );
      if (
        new Set(body.queries.map((q) => q.id)).size !== body.queries.length ||
        body.queries.some((q) => !data.queries.some((old) => old.id === q.id))
      )
        return json({ error: "Unknown or duplicate query IDs." }, 400);
      await repo.saveQueries(
        body.queries.map((q) => ({
          ...data.queries.find((old) => old.id === q.id)!,
          ...q,
          enabled: q.active,
        })),
      );
      return json({ ok: true });
    }
    if (action === "audit")
      return json(await new CheerioAuditService().audit());
    if (action === "draft") {
      const body = actionSchemas.draft.parse(await request.json());
      return json(await new SonarContentService().create(body.kind, body.recommendationId, body.regenerateOf));
    }
    if (action === "publish-fix") {
      const body = actionSchemas.publishFix.parse(await request.json());
      return json(await new SonarContentService().createPublishFix(body.recommendationId));
    }
    if (action === "draft-update") {
      const body = actionSchemas.draftUpdate.parse(await request.json());
      return json(await new SonarContentService().update(body.id, body.body, body.approve, body.event));
    }
    if (action === "verify-publication") {
      const body = actionSchemas.verifyPublication.parse(await request.json());
      return json(await verifyPublication(body.id, body.url));
    }
    if (action === "recheck-publication") {
      const body = actionSchemas.recheckPublication.parse(await request.json());
      const repo = getRepository(); const data = await repo.read(); const draft = data.drafts.find((item) => item.id === body.id);
      if (!draft?.publish?.queryId) throw new Error("The original search opportunity is unavailable for this fix.");
      if (draft.status !== "verified") throw new Error("Verify the published page before rechecking visibility.");
      const scan = await startScan(1, [draft.publish.queryId]); const now = new Date().toISOString();
      await repo.updateDraft({ ...draft, status: "monitoring", updatedAt: now, publish: { ...draft.publish, followUpScanIds: [...(draft.publish.followUpScanIds ?? []), scan.id] }, history: [...(draft.history ?? []), { at: now, action: "visibility_rechecked", detail: `Follow-up scan ${scan.id} started` }] });
      after(async () => { try { await executeScan(scan); } catch { console.error("Follow-up scan failed", scan.id); } });
      return json(scan, 202);
    }
    if (action === "sandbox-test") {
      const body = actionSchemas.sandboxTest.parse(await request.json());
      return json(await runSandboxExperiment(body.id));
    }
    if (action === "recommendation") {
      const body = actionSchemas.recommendation.parse(await request.json());
      await getRepository().updateRecommendation(body.id, body.status);
      return json({ ok: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json(
        { error: "Invalid request. Check the submitted fields." },
        400,
      );
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The operation could not be completed.",
      },
      503,
    );
  }
}
