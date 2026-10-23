"use client";
import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import type { Measurement, QueryResult, Snapshot } from "@/lib/types";
import { competitorsFor } from "@/lib/metrics";
import { comparableMentionDelta, topicCoverage } from "@/lib/overview";
import { dateLabel, safeUrl } from "@/lib/utils";
import { Badge } from "./shared";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

function MentionSparkline({ measurements }: { measurements: Measurement[] }) {
  const latest = measurements.at(-1);
  const series = measurements
    .filter(
      (m) =>
        m.querySet === latest?.querySet &&
        m.successfulQueries === m.totalQueries,
    )
    .slice(-12);
  if (series.length < 2)
    return (
      <div className="flex h-12 items-center gap-2 text-[11px] text-[#c9cde0]">
        <span className="h-px flex-1 border-t border-dashed border-[#535d7c]" />
        <span>
          {series.length
            ? "One baseline. More to discover."
            : "Your first scan starts the story."}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-[#535d7c]" />
      </div>
    );
  return (
    <svg
      viewBox="0 0 300 48"
      className="h-12 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Mention rate across ${series.length} complete, comparable scans: ${series.map((m) => `${m.mentionRate}%`).join(", ")}`}
    >
      <polyline
        points={series
          .map(
            (m, i) =>
              `${(i / (series.length - 1)) * 300},${44 - (m.mentionRate / 100) * 40}`,
          )
          .join(" ")}
        fill="none"
        stroke="#7fa6f0"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function HighlightedAnswer({ result }: { result: QueryResult }) {
  const names = [...new Set(result.mentions.map((m) => m.name))].sort(
    (a, b) => b.length - a.length,
  );
  if (!names.length) return <>{result.answer}</>;
  const pattern = new RegExp(
    `(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return (
    <>
      {result.answer.split(pattern).map((part, i) => {
        const mention = result.mentions.find(
          (m) => m.name.toLocaleLowerCase() === part.toLocaleLowerCase(),
        );
        return mention ? (
          <mark key={i} data-target={mention.isTarget}>
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

export function Overview({
  data,
  measurements,
  busy,
  onScan,
}: {
  data: Snapshot;
  measurements: Measurement[];
  busy: boolean;
  onScan: () => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const answerId = useId();
  const latest = measurements.at(-1);
  const results = latest
    ? data.results.filter((r) => r.scanId === latest.scanId)
    : [];
  const successful = results.filter((r) => r.status === "success");
  const mentioned = successful.filter((r) =>
    r.mentions.some((m) => m.isTarget),
  ).length;
  const competitors = competitorsFor(results);
  const comparison = [
    ...competitors.filter((c) => !c.isTarget).slice(0, 3),
    { name: data.restaurant.name, mentions: mentioned, isTarget: true },
  ];
  const delta = comparableMentionDelta(measurements);
  const questions = results.length
    ? results.map((r) => ({ id: r.queryId, text: r.query }))
    : data.queries.map((q) => ({ id: q.id, text: q.text }));
  const question = questions[questionIndex % (questions.length || 1)];
  const result = results.find((r) => r.queryId === question?.id);
  const target = result?.mentions.find((m) => m.isTarget);
  const coverage = topicCoverage(data.queries, results);
  const actions = data.recommendations
    .filter(
      (r) =>
        r.status === "open" &&
        !(r.id === "setup-scan" && latest) &&
        !(r.id === "setup-audit" && data.audits.length),
    )
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
        { high: 0, medium: 1, low: 2 }[b.priority],
    )
    .slice(0, 4);
  const latestAttemptFailed = data.scans[0]?.status === "failed";
  return (
    <>
      <header className="mb-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-label mb-2 text-primary">
              The local perspective
            </p>
            <h1 className="font-serif text-[29px] leading-tight tracking-[-.7px] sm:text-[34px]">
              What AI says about{" "}
              <span className="text-primary">Café Athena.</span>
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Your reputation, through the lens of AI search.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-xs font-semibold">
              <span className="size-1.5 rounded-full bg-primary" />
              Perplexity
              <span className="border-l border-[#cfc7b7] pl-2 text-[10px] font-normal text-muted-foreground">
                Agent API
              </span>
            </span>
            <Button onClick={onScan} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : ""} />
              {busy ? "Asking AI…" : latest ? "Ask again" : "Run first scan"}
            </Button>
          </div>
        </div>
        <div className="greek-key" aria-hidden="true" />
      </header>
      {latestAttemptFailed && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-[#f0d7ca] bg-[#fbefe8] px-4 py-3 text-xs text-terracotta"
        >
          The latest scan failed.{" "}
          {latest
            ? "The overview still shows your last measured scan."
            : "No answers have been measured yet."}{" "}
          <Link className="underline" href="/discovery">
            Review query errors
          </Link>
        </p>
      )}
      <div className="grid items-stretch gap-4 md:grid-cols-2 min-[87.5rem]:grid-cols-[1.05fr_1.35fr_.85fr]">
        <Card className="hero-card flex min-h-[400px] flex-col p-6">
          <h2 className="section-label text-[#c9cde0]">
            How often AI mentions you
          </h2>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <span className="font-serif text-[80px] font-semibold leading-[.9] tracking-[-4px]">
              {latest ? `${latest.mentionRate}%` : "—"}
              <span className="sr-only">
                {latest ? "mention rate" : "not measured"}
              </span>
            </span>
            <div className="pb-1">
              <p className="text-xs text-[#c9cde0]">
                {latest ? "of AI answers" : "No baseline yet"}
              </p>
              {delta !== null ? (
                <p
                  className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${delta < 0 ? "text-[#efb499]" : "text-[#9fe0a8]"}`}
                >
                  {delta > 0 ? (
                    <ArrowUp className="size-3" />
                  ) : delta < 0 ? (
                    <ArrowDown className="size-3" />
                  ) : null}
                  {delta > 0 ? "+" : ""}
                  {delta} pts vs. previous scan
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-[#9ca7c8]">
                  {latest
                    ? `${mentioned} of ${latest.successfulQueries} responses`
                    : "Measured from real responses"}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5">
            <MentionSparkline measurements={measurements} />
          </div>
          <div className="mt-4 flex-1 border-t border-[#343d60] pt-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-label text-[#c9cde0]">How you compare</h3>
              <Link
                href="/competitors"
                aria-label="Explore competitors"
                className="rounded-full p-1 text-[#c9cde0] hover:text-white"
              >
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
            {latest ? (
              <div className="space-y-3.5">
                {comparison.map((c) => (
                  <div
                    key={c.name}
                    className={`grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_35px] items-center gap-3 text-xs ${c.isTarget ? "font-semibold text-white" : "text-[#d8dced]"}`}
                    title={`${c.mentions} of ${latest.successfulQueries} valid answers mention ${c.name}. Mention rate = answers naming this restaurant ÷ valid answers.`}
                  >
                    <span className="min-w-0 leading-snug">
                      {c.name}{c.isTarget ? " (you)" : ""}
                    </span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#343d60]">
                      <div
                        className={`h-full rounded-full ${c.isTarget ? "bg-[#7fa6f0]" : "bg-[#c9cde0]"}`}
                        style={{
                          width: `${(c.mentions / latest!.successfulQueries) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-right">
                      {Math.round(
                        (c.mentions / latest!.successfulQueries) * 100,
                      )}
                      %
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="max-w-[240px] font-serif text-lg leading-relaxed text-[#d8dced]">
                Run a scan to compare Café Athena with the top three restaurants mentioned in real AI answers.
              </p>
            )}
          </div>
          <p className="mt-5 text-[10px] leading-relaxed text-[#aeb8d3]">
            {latest
              ? `Source: ${latest.successfulQueries} successful Perplexity answers · ${latest.totalQueries} queries attempted.`
              : "Source: no live answers yet. No competitors or scores have been assumed."}
          </p>
        </Card>
        <Card className="flex min-h-[400px] flex-col p-6">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="section-label text-muted-foreground">
              What AI is saying
            </h2>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous question"
                aria-controls={answerId}
                disabled={questions.length < 2}
                onClick={() =>
                  setQuestionIndex(
                    (i) => (i - 1 + questions.length) % questions.length,
                  )
                }
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next question"
                aria-controls={answerId}
                disabled={questions.length < 2}
                onClick={() =>
                  setQuestionIndex((i) => (i + 1) % questions.length)
                }
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div
            id={answerId}
            aria-live="polite"
            className="flex flex-1 flex-col"
          >
            <div className="mb-5 ml-5 self-end rounded-[16px_16px_4px_16px] bg-primary px-4 py-3 text-[13px] leading-relaxed text-white">
              {question?.text ?? "No discovery queries configured."}
            </div>
            <div className="mb-3 flex items-center gap-2">
              <Badge>Perplexity</Badge>
              <span className="text-[10px] text-muted-foreground">
                {result?.status === "success"
                  ? "Live answer"
                  : result?.status === "failed"
                    ? "Request failed"
                    : "Awaiting first scan"}
              </span>
            </div>
            {result?.status === "success" ? (
              <div className="answer-copy max-h-[200px] overflow-y-auto whitespace-pre-wrap pr-2">
                <HighlightedAnswer result={result} />
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center py-4">
                <MessageSquareText className="mb-3 size-5 text-primary/50" />
                <p className="font-serif text-[23px] leading-snug">
                  {result?.status === "failed"
                    ? "This question needs another try."
                    : "The answer is out there. Let’s find it."}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {result?.status === "failed"
                    ? result.error
                    : "Run your first scan to see the exact answer, the restaurants mentioned, and the sources AI cites."}
                </p>
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <span
                className={`text-[11px] font-semibold ${result?.status === "success" ? (target ? "text-olive" : "text-terracotta") : "text-muted-foreground"}`}
              >
                {result?.status === "success"
                  ? target
                    ? `Café Athena mentioned${target.position ? ` · #${target.position}` : ""}`
                    : "Café Athena not mentioned"
                  : "Not measured yet"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {questions.length ? (questionIndex % questions.length) + 1 : 0}{" "}
                / {questions.length} questions
              </span>
            </div>
            {result?.citations.length ? (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px]">
                <span className="text-muted-foreground">AI cited:</span>
                {result.citations.slice(0, 3).map((url, i) => {
                  const valid = safeUrl(url);
                  return valid ? (
                    <a
                      className="text-primary underline decoration-primary/30 underline-offset-2"
                      href={valid}
                      key={`${i}-${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {new URL(valid).hostname.replace(/^www\./, "")}
                    </a>
                  ) : null;
                })}
              </div>
            ) : null}
          </div>
        </Card>
        <Card className="flex flex-col p-6 md:col-span-2 min-[87.5rem]:col-span-1">
          <h2 className="section-label mb-6 text-muted-foreground">
            Where you’re heard
          </h2>
          <div className="grid flex-1 gap-5 md:grid-cols-2 min-[87.5rem]:grid-cols-1">
            {coverage.map((topic) => (
              <div key={topic.id}>
                <div className="mb-2 flex justify-between gap-2 text-[12px]">
                  <span>{topic.label}</span>
                  <span
                    className={
                      topic.rate === null
                        ? "text-muted-foreground"
                        : topic.rate === 0
                          ? "font-semibold text-terracotta"
                          : "font-semibold text-olive"
                    }
                  >
                    {topic.rate === null
                      ? topic.tracked
                        ? "Not scanned"
                        : "Not tracked"
                      : `${topic.rate}%`}
                  </span>
                </div>
                <div
                  className="flex gap-1"
                  role="img"
                  aria-label={`${topic.label}: ${topic.rate === null ? (topic.tracked ? "not scanned" : "not tracked") : `${topic.mentioned} mentions in ${topic.count} successful answers`}`}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2 flex-1 rounded-[2px] ${topic.rate !== null && i < Math.round(topic.rate / 10) ? "bg-primary" : "bg-muted"}`}
                    />
                  ))}
                </div>
                {topic.count > 0 && (
                  <p className="mt-1.5 text-[9px] text-muted-foreground">
                    {topic.mentioned} of {topic.count} answers
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground">
            Mention rate by question type. Untracked topics have no configured
            query.
          </p>
        </Card>
      </div>
      <div className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "AI Visibility Score",
            value: latest ? `${latest.visibilityScore}` : "—",
            suffix: "/ 100",
          },
          {
            label: "Average position",
            value: latest?.averagePosition
              ? `#${latest.averagePosition.toFixed(1)}`
              : "—",
            suffix: "when ranked",
          },
          {
            label: "Your share of voice",
            value:
              latest && competitors.length
                ? `${latest.shareOfVoice.toFixed(0)}%`
                : "—",
            suffix: "of restaurant mentions",
          },
          {
            label: "Scan coverage",
            value: latest
              ? `${latest.successfulQueries} / ${latest.totalQueries}`
              : "—",
            suffix: "successful queries",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-border px-5 py-4"
          >
            <p className="text-[10px] font-medium text-muted-foreground">
              {m.label}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="font-serif text-[27px] leading-none">
                {m.value}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {m.suffix}
              </span>
            </div>
          </div>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-5 pb-3">
          <h2 className="section-label text-muted-foreground">
            What needs attention <span className="px-1 text-terracotta">→</span>{" "}
            Your next move
          </h2>
          <span className="text-[10px] text-muted-foreground">
            Review first. Nothing is published automatically.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border text-[9px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-medium">Signal</th>
                <th className="px-3 py-3 font-medium">What we know</th>
                <th className="px-3 py-3 font-medium">Recommended action</th>
                <th className="px-3 py-3 font-medium">Priority</th>
                <th className="px-6 py-3 text-right font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-4">
                    <Badge>{r.category}</Badge>
                  </td>
                  <td className="max-w-[260px] px-3 py-4">
                    <p
                      className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground"
                      title={r.evidence}
                    >
                      {r.evidence}
                    </p>
                    <span className="mt-1 block text-[9px] text-muted-foreground">
                      {r.source === "setup"
                        ? "Setup guidance"
                        : `From ${r.source} evidence`}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-3 py-4 text-xs font-semibold leading-relaxed">
                    {r.title}
                  </td>
                  <td
                    className={`px-3 py-4 text-[10px] font-semibold uppercase ${r.priority === "high" ? "text-olive" : "text-[#8a5a10]"}`}
                  >
                    {r.priority}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/recommendations">
                        Review
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!actions.length && (
            <div className="flex items-center justify-center gap-2 px-6 py-8 text-sm text-olive">
              <Check className="size-4" />
              All caught up. Run another scan to find new opportunities.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-background/40 px-6 py-3">
          <Link
            className="flex items-center gap-2 text-[11px] font-semibold text-primary"
            href="/recommendations"
          >
            All recommendations
            <ArrowRight className="size-3" />
          </Link>
          <Link
            className="text-[11px] text-muted-foreground hover:text-primary"
            href="/studio"
          >
            Open Content Studio
          </Link>
        </div>
      </Card>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] text-muted-foreground">
        <span>
          <strong className="font-semibold text-foreground">Engine:</strong>{" "}
          Perplexity Agent API
        </span>
        <span>
          <strong className="font-semibold text-foreground">Evidence:</strong>{" "}
          AI answers · Website HTML
        </span>
        <Link href="/measurement#methodology" className="text-primary">
          How we measure
          <ArrowUpRight className="ml-1 inline size-3" />
        </Link>
        <span className="ml-auto">
          {latest
            ? `Measured ${dateLabel(latest.createdAt)}`
            : "Waiting for your first scan"}
        </span>
      </div>
    </>
  );
}
