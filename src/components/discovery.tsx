"use client";
import { Fragment, useState } from "react";
import { Download, Info, Search, Settings2 } from "lucide-react";
import type { SearchQuery, Snapshot } from "@/lib/types";
import { measure } from "@/lib/metrics";
import { dateLabel, safeUrl } from "@/lib/utils";
import { Badge, EmptyState, PageHeading } from "./shared";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type QueryEdit = {
  id: string;
  text: string;
  category: string;
  active: boolean;
};
const field =
  "rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30";
function QueryEditor({
  queries,
  busy,
  onSave,
}: {
  queries: SearchQuery[];
  busy: boolean;
  onSave: (queries: QueryEdit[]) => void;
}) {
  const [draft, setDraft] = useState<QueryEdit[]>(() =>
    queries.map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category ?? q.intent,
      active: q.enabled,
    })),
  );
  const update = (id: string, patch: Partial<QueryEdit>) =>
    setDraft((old) => old.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Query bank editor</CardTitle>
        <p className="text-xs text-muted-foreground">
          Stable IDs stay unchanged. Edits apply to future scans; previous
          answers retain their original query.
        </p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
          }}
        >
          <div className="max-h-[480px] space-y-3 overflow-y-auto pr-2">
            {draft.map((q) => (
              <div
                key={q.id}
                className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[24px_1fr_180px]"
              >
                <input
                  type="checkbox"
                  checked={q.active}
                  disabled={busy}
                  onChange={(e) => update(q.id, { active: e.target.checked })}
                  aria-label={`Active: ${q.id}`}
                  className="accent-primary"
                />
                <label className="text-[10px] text-muted-foreground">
                  {q.id}
                  <input
                    className={`${field} mt-1 block w-full`}
                    value={q.text}
                    minLength={8}
                    maxLength={300}
                    required
                    disabled={busy}
                    aria-label={`Query: ${q.id}`}
                    onChange={(e) => update(q.id, { text: e.target.value })}
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  Category
                  <input
                    className={`${field} mt-1 block w-full`}
                    value={q.category}
                    minLength={1}
                    maxLength={80}
                    required
                    disabled={busy}
                    aria-label={`Category: ${q.id}`}
                    onChange={(e) => update(q.id, { category: e.target.value })}
                  />
                </label>
              </div>
            ))}
          </div>
          <Button className="mt-4" disabled={busy} type="submit">
            Save query bank
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
function Formula({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      className="group relative inline-flex cursor-help"
      aria-label={text}
    >
      <Info className="size-3.5" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-6 z-20 hidden w-64 rounded-lg bg-foreground p-3 text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  );
}
export function Discovery({
  data,
  busy,
  onScan,
  onSaveQueries,
}: {
  data: Snapshot;
  busy: boolean;
  onScan: (count: number, queryIds?: string[]) => void;
  onSaveQueries: (queries: QueryEdit[]) => void;
}) {
  const [selectedScan, setSelectedScan] = useState("");
  const [category, setCategory] = useState("all");
  const [count, setCount] = useState(12);
  const [editor, setEditor] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const scan = data.scans.find((s) => s.id === selectedScan) ?? data.scans[0];
  const allResults = data.results.filter((r) => r.scanId === scan?.id);
  const categories = [
    ...new Set(data.queries.map((q) => q.category ?? q.intent)),
  ];
  const eligible = data.queries.filter(
    (q) =>
      q.enabled &&
      (category === "all" || (q.category ?? q.intent) === category),
  );
  const results = allResults
    .filter(
      (r) =>
        category === "all" ||
        (r.queryCategory ??
          data.queries.find((q) => q.id === r.queryId)?.category) === category,
    )
    .sort(
      (a, b) =>
        (scan?.queries?.findIndex((q) => q.id === a.queryId) ?? 0) -
        (scan?.queries?.findIndex((q) => q.id === b.queryId) ?? 0),
    );
  const metrics = scan ? measure(scan, allResults) : null;
  const valid = allResults.filter((r) => r.status === "success");
  const mentions = valid.reduce((n, r) => n + r.mentions.length, 0);
  const targets = valid.filter((r) =>
    r.mentions.some((m) => m.isTarget),
  ).length;
  const ranked = valid.filter((r) =>
    r.mentions.some((m) => m.isTarget && m.position !== null),
  ).length;
  return (
    <>
      <PageHeading
        title="AI Discovery"
        description="Perplexity Agent API search visibility sample. Real answers, with the evidence behind every metric."
        action={
          <Button
            disabled={busy || eligible.length < count}
            onClick={() => {
              setSelectedScan("");
              onScan(
                count,
                category === "all" ? undefined : eligible.map((q) => q.id),
              );
            }}
          >
            <Search />
            Run {count}-query scan
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          Query category
          <select
            className={`${field} mt-1 block max-w-full`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Scan size
          <select
            className={`${field} mt-1 block`}
            value={count}
            disabled={busy}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[5, 12, 30].map((n) => (
              <option key={n} value={n}>
                {n} queries
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => setEditor(!editor)}>
          <Settings2 />
          {editor ? "Close editor" : "Edit query bank"}
        </Button>
        <span className="pb-2 text-xs text-muted-foreground">
          {eligible.length} active queries in this filter
          {eligible.length < count
            ? ` · select a broader category or enable more queries to run ${count}`
            : ""}
        </span>
      </div>
      {editor && (
        <QueryEditor
          key={JSON.stringify(data.queries)}
          queries={data.queries}
          busy={busy}
          onSave={onSaveQueries}
        />
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Mention rate",
            value: metrics ? `${metrics.mentionRate}%` : "—",
            formula: `Target mentioned / valid completed queries × 100. Sample: ${targets}/${valid.length}. Failed, cancelled and unverified excluded.`,
          },
          {
            label: "Average rank",
            value: metrics?.averagePosition?.toFixed(1) ?? "—",
            formula: `Mean visible recommendation position where target is ranked. Sample: ${ranked} ranked target appearances. Not an official platform ranking.`,
          },
          {
            label: "Share of voice",
            value: metrics ? `${metrics.shareOfVoice.toFixed(1)}%` : "—",
            formula: `Target mentions / all detected restaurant mentions × 100. Sample: ${targets}/${mentions} mentions in ${valid.length} valid queries. Competitors use the same denominator.`,
          },
          {
            label: "Visibility score",
            value: metrics ? `${metrics.visibilityScore}/100` : "—",
            formula: `100 × mean(1/target rank, otherwise 0) across ${valid.length} valid queries; up to five recommendations. Not an official platform score.`,
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {k.label}
                <Formula text={k.formula} />
              </div>
              <p className="mt-3 text-3xl font-semibold">{k.value}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {valid.length} valid / {scan?.queryCount ?? 0} requested queries
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Search responses</CardTitle>
            <div className="flex flex-wrap gap-2">
              {data.scans.length > 0 && (
                <select
                  aria-label="Select scan"
                  className={`${field} max-w-[240px]`}
                  value={scan?.id ?? ""}
                  onChange={(e) => setSelectedScan(e.target.value)}
                >
                  {data.scans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {dateLabel(s.startedAt)} · {s.queryCount} queries ·{" "}
                      {s.status}
                    </option>
                  ))}
                </select>
              )}
              {results.length && scan ? (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/api/export?scanId=${encodeURIComponent(scan.id)}&category=${encodeURIComponent(category)}`}
                    download
                  >
                    <Download />
                    Download CSV
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <Download />
                  Download CSV
                </Button>
              )}
            </div>
          </div>
          {scan && (
            <p className="text-xs text-muted-foreground">
              {scan.status} · {allResults.length}/{scan.queryCount} processed ·{" "}
              {allResults.filter((r) => r.status === "unverified").length}{" "}
              unverified ·{" "}
              {allResults.filter((r) => r.status === "failed").length} failed.
              KPIs cover the full selected scan; the category filter controls
              table rows and new scans.
            </p>
          )}
          {scan?.error && (
            <p role="alert" className="text-xs text-terracotta">
              {scan.error}
            </p>
          )}
        </CardHeader>
        {!results.length ? (
          <EmptyState
            title={
              scan?.status === "running"
                ? "Waiting for the first response"
                : "No responses in this view"
            }
            description="Run a live scan or change the category filter. No sample answers are generated."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead className="border-y border-border bg-muted/50 text-muted-foreground">
                <tr>
                  {[
                    "Query",
                    "Target mentioned",
                    "Rank",
                    "Competitors",
                    "Status",
                    "Sources",
                  ].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border align-top">
                      <td className="max-w-[280px] px-4 py-4">
                        <button
                          onClick={() =>
                            setExpanded(expanded === r.id ? null : r.id)
                          }
                          aria-expanded={expanded === r.id}
                          aria-controls={`answer-${r.id}`}
                          className="text-left font-medium text-primary hover:underline"
                        >
                          {r.query}
                        </button>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {r.queryCategory} · {r.queryId}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {r.status !== "success"
                          ? "Not measured"
                          : r.mentions.some((m) => m.isTarget)
                            ? "Yes"
                            : "No"}
                      </td>
                      <td className="px-4 py-4">
                        {r.status === "success"
                          ? (r.mentions.find((m) => m.isTarget)?.position ??
                            "—")
                          : "—"}
                      </td>
                      <td className="max-w-[220px] px-4 py-4">
                        {r.status === "success"
                          ? r.mentions
                              .filter((m) => !m.isTarget)
                              .map((m) => m.name)
                              .join(", ") || "—"
                          : "Not verified"}
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          tone={
                            r.status === "success"
                              ? "green"
                              : r.status === "failed"
                                ? "red"
                                : "amber"
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {r.citations.map(
                            (url, i) =>
                              safeUrl(url) && (
                                <a
                                  key={`${url}-${i}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline"
                                  aria-label={`Source ${r.citationIds?.[i] ?? i + 1} for ${r.query}`}
                                >
                                  [{r.citationIds?.[i] ?? i + 1}]
                                </a>
                              ),
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr id={`answer-${r.id}`}>
                        <td
                          colSpan={6}
                          className="border-b border-border bg-muted/30 p-5"
                        >
                          <p className="mb-3 text-[11px] text-muted-foreground">
                            Original provider answer · {r.model} ·{" "}
                            {dateLabel(r.createdAt)}
                          </p>
                          {r.error && (
                            <p role="alert" className="mb-3 text-terracotta">
                              {r.error}
                            </p>
                          )}
                          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-7">
                            {r.answer || "No answer returned."}
                          </pre>
                          {r.usage && (
                            <details className="mt-4">
                              <summary className="cursor-pointer text-muted-foreground">
                                Provider usage
                              </summary>
                              <pre className="mt-2 whitespace-pre-wrap">
                                {JSON.stringify(r.usage, null, 2)}
                              </pre>
                            </details>
                          )}
                          {r.rawResponse && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-muted-foreground">
                                Raw provider response
                              </summary>
                              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
                                {r.rawResponse}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
