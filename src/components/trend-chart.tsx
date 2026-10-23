"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoAxesCombined } from "lucide-react";
import type { Measurement } from "@/lib/types";
import { EmptyState } from "./shared";
export function TrendChart({ measurements }: { measurements: Measurement[] }) {
  if (!measurements.length)
    return (
      <div className="relative mx-6 mb-5 overflow-hidden rounded-lg border border-dashed border-[#e6dfd1] bg-[#faf8f4]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "linear-gradient(#e6dfd1 1px,transparent 1px)",
            backgroundSize: "100% 54px",
          }}
        />
        <div className="relative">
          <EmptyState
            icon={ChartNoAxesCombined}
            title="Your visibility story starts here"
            description="Your first scan creates a baseline. Future scans reveal how your AI presence changes over time."
          />
        </div>
        <div className="absolute bottom-3 left-4 text-[9px] text-[#767b90]">
          NO SCANS YET
        </div>
      </div>
    );
  const chartData = measurements.map((m) => ({
    ...m,
    date: new Date(m.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));
  return (
    <div
      className="h-[252px] w-full pr-6 pl-2"
      role="img"
      aria-label={`Visibility scores across ${measurements.length} live scans: ${measurements.map((m) => m.visibilityScore).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 12, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="visibility-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e4fa3" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#1e4fa3" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#ede7db"
            vertical={false}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "#4a5170", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            dy={8}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "#4a5170", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e6dfd1",
              fontSize: 12,
            }}
            formatter={(value) => [`${value} / 100`, "AI Visibility Score"]}
          />
          <Area
            type="linear"
            dataKey="visibilityScore"
            stroke="#1e4fa3"
            strokeWidth={2.5}
            fill="url(#visibility-fill)"
            dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
