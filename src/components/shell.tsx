"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Compass,
  FilePenLine,
  LayoutDashboard,
  MapPin,
  Menu,
  Search,
  Settings2,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import type { Section } from "@/lib/types";
const navigation = [
  { id: "overview", name: "Overview", icon: LayoutDashboard, href: "/" },
  { id: "discovery", name: "AI Discovery", icon: Compass, href: "/discovery" },
  {
    id: "competitors",
    name: "Competitors",
    icon: UsersRound,
    href: "/competitors",
  },
  {
    id: "recommendations",
    name: "Recommendations",
    icon: Sparkles,
    href: "/recommendations",
  },
  { id: "studio", name: "Content Studio", icon: FilePenLine, href: "/studio" },
  {
    id: "measurement",
    name: "Measurement",
    icon: ChartNoAxesCombined,
    href: "/measurement",
  },
];
export function Shell({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = navigation.find((n) => n.id === section)?.name ?? "Settings";
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-border bg-[#f7f4ee] transition-transform lg:translate-x-0",
          open
            ? "visible translate-x-0"
            : "invisible -translate-x-full lg:visible",
        )}
      >
        <Link
          href="/"
          className="flex h-[76px] items-center gap-2.5 px-7"
          aria-label="Kleos overview"
        >
          <span className="font-serif text-[24px] font-bold tracking-[-.7px] text-primary">
            KLEOS
          </span>
        </Link>
        <div className="mx-4 mb-8 rounded-lg border border-border bg-white p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-[#ede7db] font-serif text-lg text-[#4a5170]">
              A
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="restaurant" className="sr-only">
                Restaurant
              </label>
              <select
                id="restaurant"
                className="w-full appearance-none bg-transparent text-xs font-semibold"
                defaultValue="athena"
              >
                <option value="athena">Café Athena</option>
              </select>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Pacific Beach, San Diego
              </p>
            </div>
            <ChevronDown className="size-3 text-muted-foreground" />
          </div>
        </div>
        <p className="mb-3 px-7 text-[10px] font-semibold uppercase tracking-[1.5px] text-[#767b90]">
          Workspace
        </p>
        <nav aria-label="Main navigation" className="space-y-1 px-3">
          {navigation.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={section === n.id ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] transition-colors",
                section === n.id
                  ? "bg-[#e4eafa] font-semibold text-[#1e4fa3]"
                  : "text-[#4a5170] hover:bg-muted hover:text-foreground",
              )}
            >
              <n.icon className="size-[17px]" strokeWidth={1.7} />
              {n.name}
              {section === n.id && (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="mb-5 rounded-xl border border-[#e6dfd1] bg-[#ede7db] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#1e4fa3]">
              <Sparkles className="size-3.5" /> A new kind of discovery
            </div>
            <p className="text-[11px] leading-relaxed text-[#4a5170]">
              Be the place AI recommends.
              <br />
              Start with your first visibility scan.
            </p>
            <Link
              href="/discovery"
              className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary"
            >
              Explore AI Discovery <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <Link
            href="/settings"
            aria-current={section === "settings" ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px]",
              section === "settings"
                ? "bg-[#e4eafa] text-primary"
                : "text-muted-foreground",
            )}
          >
            <Settings2 className="size-4" />
            Settings
          </Link>
          <Link
            href="/measurement#methodology"
            className="mt-1 flex items-center gap-3 px-3 py-2 text-[13px] text-muted-foreground"
          >
            <CircleHelp className="size-4" />
            How scoring works
            <ArrowUpRight className="ml-auto size-3" />
          </Link>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-6 py-4">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#ede7db] text-[11px] font-semibold text-[#4a5170]">
            CA
          </span>
          <div>
            <p className="text-xs font-medium">Café Athena workspace</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Kleos pilot
            </p>
          </div>
        </div>
      </aside>
      <div className="lg:pl-[236px]">
        <header className="flex h-[68px] items-center justify-between border-b border-border bg-background px-5 md:px-9">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(!open)}
              className="lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="workspace-navigation"
            >
              {open ? <X /> : <Menu />}
            </Button>
            <span className="text-xs text-muted-foreground">Workspace</span>
            <span className="text-border">/</span>
            <span className="text-xs font-medium">{current}</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              <MapPin className="size-3.5" />
              San Diego, CA
            </span>
            <Link
              href="/discovery"
              aria-label="Explore search queries"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <Search className="size-4" />
            </Link>
            <span className="size-7 rounded-full bg-[#ede7db] text-center text-[10px] font-semibold leading-7 text-[#4a5170]">
              CA
            </span>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-[1700px] px-5 py-6 md:px-7 md:py-7"
        >
          {children}
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-[10px] text-[#767b90]">
            <span>
              Kleos <span className="px-2">·</span> Made for places worth
              discovering.
            </span>
            <span>
              Pacific Beach, San Diego <span className="px-2">·</span>{" "}
              Perplexity-powered search
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
