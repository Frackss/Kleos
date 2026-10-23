import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { restaurant, queries, setupRecommendations } from "@/lib/seed";
import type {
  Snapshot,
  ScanRun,
  QueryResult,
  WebsiteAudit,
  Recommendation,
  ContentDraft,
  Restaurant,
  SearchQuery,
} from "@/lib/types";
export type StoredData = Omit<Snapshot, "config">;
export interface Repository {
  read(): Promise<StoredData>;
  startScan(scan: ScanRun): Promise<void>;
  saveResult(result: QueryResult): Promise<void>;
  cancelScan(id: string): Promise<void>;
  saveQueries(queries: SearchQuery[]): Promise<void>;
  finishScan(
    scan: ScanRun,
    results: QueryResult[],
    recommendations: Recommendation[],
  ): Promise<void>;
  saveAudit(
    audit: WebsiteAudit,
    recommendations: Recommendation[],
  ): Promise<void>;
  saveDraft(draft: ContentDraft): Promise<void>;
  updateDraft(draft: ContentDraft): Promise<void>;
  updateRecommendation(
    id: string,
    status: Recommendation["status"],
  ): Promise<void>;
}
function initialData(): StoredData {
  return {
    restaurant,
    queries: structuredClone(queries),
    scans: [],
    results: [],
    audits: [],
    recommendations: structuredClone(setupRecommendations),
    drafts: [],
  };
}
const globalStore = globalThis as unknown as { localLensStore?: StoredData };
class MemoryRepository implements Repository {
  private get data() {
    return (globalStore.localLensStore ??= initialData());
  }
  async read() {
    return structuredClone(this.data);
  }
  async startScan(scan: ScanRun) {
    if (
      this.data.scans.some(
        (s) =>
          s.status === "running" &&
          Date.now() - Date.parse(s.startedAt) < 300_000,
      )
    )
      throw new Error(
        "A scan is already in progress. Try again when it finishes.",
      );
    for (const s of this.data.scans)
      if (s.status === "running") {
        s.status = "failed";
        s.error = "Scan expired before completion.";
      }
    this.data.scans.unshift(structuredClone(scan));
  }
  async saveResult(result: QueryResult) {
    if (
      this.data.results.some(
        (r) => r.scanId === result.scanId && r.queryId === result.queryId,
      )
    )
      return;
    this.data.results.unshift(structuredClone(result));
    const scan = this.data.scans.find((s) => s.id === result.scanId);
    if (scan) {
      const results = this.data.results.filter((r) => r.scanId === scan.id);
      scan.completedCount = results.length;
      scan.successCount = results.filter((r) => r.status === "success").length;
    }
  }
  async cancelScan(id: string) {
    const scan = this.data.scans.find((s) => s.id === id);
    if (!scan) throw new Error("Scan not found.");
    if (scan.status === "running") scan.cancelRequested = true;
  }
  async saveQueries(items: SearchQuery[]) {
    for (const item of items) {
      const index = this.data.queries.findIndex((q) => q.id === item.id);
      if (index < 0) throw new Error("Unknown query ID.");
      this.data.queries[index] = structuredClone(item);
    }
  }
  async finishScan(
    scan: ScanRun,
    results: QueryResult[],
    recommendations: Recommendation[],
  ) {
    const current = this.data.scans.find((s) => s.id === scan.id);
    if (current?.cancelRequested)
      scan = { ...scan, status: "cancelled", cancelRequested: true };
    this.data.scans = this.data.scans.map((s) =>
      s.id === scan.id ? structuredClone(scan) : s,
    );
    for (const result of results) await this.saveResult(result);
    for (const rec of recommendations) this.upsertRec(rec);
  }
  private upsertRec(rec: Recommendation) {
    const old = this.data.recommendations.find((r) => r.id === rec.id);
    this.data.recommendations = this.data.recommendations.filter(
      (r) => r.id !== rec.id,
    );
    this.data.recommendations.push({
      ...rec,
      status: old?.status ?? rec.status,
    });
  }
  async saveAudit(audit: WebsiteAudit, recommendations: Recommendation[]) {
    this.data.audits.unshift(audit);
    for (const rec of recommendations) this.upsertRec(rec);
  }
  async saveDraft(draft: ContentDraft) {
    this.data.drafts.unshift(draft);
  }
  async updateDraft(draft: ContentDraft) {
    const index = this.data.drafts.findIndex((item) => item.id === draft.id);
    if (index < 0) throw new Error("Draft not found.");
    this.data.drafts[index] = structuredClone(draft);
  }
  async updateRecommendation(id: string, status: Recommendation["status"]) {
    const rec = this.data.recommendations.find((r) => r.id === id);
    if (!rec) throw new Error("Recommendation not found.");
    rec.status = status;
  }
}
class SupabaseRepository implements Repository {
  private db: SupabaseClient;
  constructor() {
    this.db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  private async records<T>(table: string, limit = 1000): Promise<T[]> {
    const { data, error } = await this.db
      .from(table)
      .select("payload")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error)
      throw new Error(
        "Database read failed. Check the Supabase migration and server configuration.",
      );
    return (data ?? []).map((r) => r.payload as T);
  }
  async read(): Promise<StoredData> {
    const [scans, results, audits, recommendations, drafts] = await Promise.all(
      [
        this.records<ScanRun>("scan_runs", 30),
        this.records<QueryResult>("query_results"),
        this.records<WebsiteAudit>("website_audits"),
        this.records<Recommendation>("recommendations"),
        this.records<ContentDraft>("content_drafts"),
      ],
    );
    const { data: profile, error: profileError } = await this.db
      .from("restaurants")
      .select("payload")
      .eq("id", restaurant.id)
      .single();
    if (profileError || !profile)
      throw new Error(
        "Restaurant profile not found. Run the Supabase migration.",
      );
    const storedQueries = await this.records<SearchQuery>("search_queries");
    return {
      restaurant: profile.payload as Restaurant,
      queries: storedQueries.sort(
        (a, b) =>
          queries.findIndex((q) => q.id === a.id) -
          queries.findIndex((q) => q.id === b.id),
      ),
      scans,
      results: results.filter((r) => scans.some((s) => s.id === r.scanId)),
      audits,
      recommendations: [
        ...setupRecommendations.filter(
          (r) => !recommendations.some((rec) => rec.id === r.id),
        ),
        ...recommendations,
      ],
      drafts,
    };
  }
  async startScan(scan: ScanRun) {
    const { error } = await this.db.rpc("start_scan", { scan_payload: scan });
    if (error?.code === "23505")
      throw new Error(
        "A scan is already in progress. Try again when it finishes.",
      );
    if (error)
      throw new Error("Could not start scan. Check your Supabase migration.");
  }
  async saveResult(result: QueryResult) {
    const { error } = await this.db.rpc("save_query_result", {
      result_payload: result,
    });
    if (error)
      throw new Error(
        "Could not persist query result. Check the discovery migration.",
      );
  }
  async cancelScan(id: string) {
    const { error } = await this.db.rpc("cancel_scan", { scan_id: id });
    if (error) throw new Error("Could not cancel scan.");
  }
  async saveQueries(items: SearchQuery[]) {
    const { error } = await this.db.from("search_queries").upsert(
      items.map((q) => ({
        id: q.id,
        restaurant_id: q.restaurantId,
        payload: q,
      })),
    );
    if (error) throw new Error("Could not save query bank.");
  }
  async finishScan(
    scan: ScanRun,
    results: QueryResult[],
    recommendations: Recommendation[],
  ) {
    const { error } = await this.db.rpc("finish_scan", {
      scan_payload: scan,
      result_payloads: results,
      recommendation_payloads: recommendations,
    });
    if (error)
      throw new Error(
        "Scan completed but saving failed. Check Supabase before rerunning.",
      );
  }
  async saveAudit(audit: WebsiteAudit, recommendations: Recommendation[]) {
    const { error } = await this.db.rpc("save_audit", {
      audit_payload: audit,
      recommendation_payloads: recommendations,
    });
    if (error) throw new Error("Could not save website audit.");
  }
  async saveDraft(draft: ContentDraft) {
    const { error } = await this.db.from("content_drafts").insert({
      id: draft.id,
      restaurant_id: draft.restaurantId,
      payload: draft,
    });
    if (error) throw new Error("Could not save content draft.");
  }
  async updateDraft(draft: ContentDraft) {
    const { error } = await this.db.from("content_drafts").upsert({
      id: draft.id,
      restaurant_id: draft.restaurantId,
      payload: draft,
    });
    if (error) throw new Error("Could not update content draft.");
  }
  async updateRecommendation(id: string, status: Recommendation["status"]) {
    const { recommendations } = await this.read();
    const rec = recommendations.find((r) => r.id === id);
    if (!rec) throw new Error("Recommendation not found.");
    const { error } = await this.db.from("recommendations").upsert({
      id,
      restaurant_id: restaurant.id,
      payload: { ...rec, status },
    });
    if (error) throw new Error("Could not update recommendation.");
  }
}
export function hasSupabase() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
export function getRepository(): Repository {
  if (
    Boolean(process.env.SUPABASE_URL) !==
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
    throw new Error(
      "Supabase configuration is incomplete. Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  return hasSupabase() ? new SupabaseRepository() : new MemoryRepository();
}
