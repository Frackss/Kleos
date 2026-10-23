import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Info, Radar, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import type { Snapshot } from "@/lib/types";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium",
        {
          neutral: "bg-[#ede7db] text-[#4a5170]",
          blue: "bg-accent text-primary",
          green: "bg-[#edf0e1] text-olive",
          amber: "bg-[#f7efd9] text-[#8a5a10]",
          red: "bg-[#fbefe8] text-terracotta",
        }[tone],
      )}
    >
      {children}
    </span>
  );
}
export function EmptyState({
  icon: Icon = Radar,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-5 py-8" : "px-6 py-12",
      )}
    >
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl border border-[#e6dfd1] bg-[#f7f4ee] text-[#1e4fa3]">
        <Icon className="size-5" strokeWidth={1.5} />
      </span>
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-[310px] text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-.7px]">
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="pt-1">{action}</div>}
      <div className="greek-key mt-3 basis-full" aria-hidden="true" />
    </div>
  );
}
export function DataNotice({ data }: { data: Snapshot }) {
  const live = data.scans.some((s) => s.successCount > 0);
  return (
    <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-[#e6dfd1] bg-[#f0ece3] px-4 py-3 text-xs text-[#4a5170]">
      <Info className="mt-0.5 size-3.5 shrink-0 text-[#1e4fa3]" />
      <div className="flex-1 leading-relaxed">
        <strong className="font-medium text-[#1b2340]">
          {live
            ? "Perplexity Agent API search visibility sample"
            : "Demo workspace · sample business profile"}
        </strong>
        <span className="mx-2 hidden sm:inline">—</span>
        <span className="block sm:inline">
          {live
            ? "Metrics reflect saved provider responses, not guaranteed search rankings."
            : "Your restaurant is ready. Run a scan to establish your first real baseline."}
          {data.config.persistence === "memory" &&
            " Local development storage (in memory): results and edits are lost on server restart. Connect Supabase for persistence."}
        </span>
      </div>
      <Link
        href="/settings"
        className="flex shrink-0 items-center gap-1 pt-0.5 text-[11px] font-medium text-primary"
      >
        Setup
        <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}
export function ScanButton({
  busy,
  onScan,
}: {
  busy: boolean;
  onScan: () => void;
}) {
  return (
    <Button onClick={onScan} disabled={busy}>
      <Sparkles className={busy ? "animate-pulse" : ""} />
      {busy ? "Scanning AI responses…" : "Run AI Visibility Scan"}
    </Button>
  );
}
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workspace">
      <div className="skeleton mb-3 h-8 w-52" />
      <div className="skeleton mb-8 h-4 w-80 max-w-full" />
      <div className="skeleton mb-6 h-14" />
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-36" />
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.8fr_1fr]">
        <div className="skeleton h-80" />
        <div className="skeleton h-80" />
      </div>
    </div>
  );
}
