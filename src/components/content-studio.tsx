"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  Braces,
  Copy,
  Download,
  FilePenLine,
  MessageSquareText,
  Plus,
} from "lucide-react";
import type { ContentDraft, Snapshot } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { Badge, EmptyState, PageHeading } from "./shared";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
export function ContentStudio({
  data,
  busy,
  onCreate,
}: {
  data: Snapshot;
  busy: boolean;
  onCreate: (kind: ContentDraft["kind"]) => void;
}) {
  const [selected, setSelected] = useState("");
  const draft = data.drafts.find((d) => d.id === selected) ?? data.drafts[0];
  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.body);
      toast.success("Draft copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable. Use Download instead.");
    }
  }
  function download() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([draft.body], {
        type: draft.kind === "schema" ? "application/ld+json" : "text/plain",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `cafe-athena-${draft.kind}.${draft.kind === "schema" ? "json" : "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        title="Good content. Clearer signals."
        description="Turn your restaurant’s story into useful, search-friendly website content."
      />
      <div className="mb-6 rounded-lg border border-[#e8dcbf] bg-[#f7efd9]/50 px-4 py-3 text-xs leading-relaxed text-[#8a5a10]">
        Template drafts use your supplied business profile. Verify all details
        before publishing. Content is not AI-generated, automatically published,
        or a promise of improved rankings.
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            kind: "description" as const,
            title: "Restaurant description",
            detail:
              "A concise, locally relevant introduction for your website.",
            icon: FilePenLine,
          },
          {
            kind: "faq" as const,
            title: "Discovery FAQs",
            detail: "Clear answers to the questions potential guests ask.",
            icon: MessageSquareText,
          },
          {
            kind: "schema" as const,
            title: "Restaurant schema",
            detail: "JSON-LD to help machines understand your restaurant.",
            icon: Braces,
          },
        ].map((c) => (
          <Card key={c.kind}>
            <CardContent className="pt-5">
              <c.icon className="mb-5 size-5 text-[#1e4fa3]" />
              <h2 className="text-sm font-semibold">{c.title}</h2>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
                {c.detail}
              </p>
              <Button
                onClick={() => {
                  setSelected("");
                  onCreate(c.kind);
                }}
                disabled={busy}
                variant="outline"
                size="sm"
                className="mt-5"
              >
                <Plus />
                Create template draft
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Your drafts</CardTitle>
            <Badge>{data.drafts.length}</Badge>
          </CardHeader>
          {data.drafts.length ? (
            <div className="px-3 pb-3">
              {data.drafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-3 text-left ${draft?.id === d.id ? "bg-accent" : "hover:bg-muted"}`}
                >
                  <span className="block text-xs font-medium">{d.title}</span>
                  <span className="mt-1.5 block text-[10px] text-muted-foreground">
                    {dateLabel(d.createdAt)} · Draft
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FilePenLine}
              title="Room for your next idea"
              description="Choose a template above to create your first draft."
              compact
            />
          )}
        </Card>
        <Card>
          {draft ? (
            <>
              <CardHeader>
                <div>
                  <CardTitle>{draft.title}</CardTitle>
                  <div className="mt-2">
                    <Badge tone="amber">Review before publishing</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copy}
                    aria-label="Copy draft"
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={download}
                    aria-label="Download draft"
                  >
                    <Download />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <label htmlFor="draft-content" className="sr-only">
                  Draft content
                </label>
                <textarea
                  id="draft-content"
                  value={draft.body}
                  readOnly
                  className={`min-h-[340px] w-full resize-y rounded-lg border border-border bg-[#faf8f4] p-5 text-xs leading-7 ${draft.kind === "schema" ? "font-mono" : ""}`}
                />
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Saved{" "}
                  {data.config.persistence === "memory"
                    ? "temporarily in this server process"
                    : "to Supabase"}{" "}
                  · Template based on supplied details
                </p>
              </CardContent>
            </>
          ) : (
            <EmptyState
              icon={FilePenLine}
              title="A better first impression starts here"
              description="Create a draft, review the business details, and export it for your website."
            />
          )}
        </Card>
      </div>
    </>
  );
}
