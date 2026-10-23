import { measure } from "./metrics";
import type { QueryResult, ScanRun } from "./types";

export function compareScans(before: ScanRun, after: ScanRun, results: QueryResult[]) {
  const left = results.filter((result) => result.scanId === before.id && result.status === "success");
  const right = results.filter((result) => result.scanId === after.id && result.status === "success");
  const rightByQuery = new Map(right.map((result) => [result.queryId, result]));
  const pairs = left.flatMap((result) => rightByQuery.has(result.queryId) ? [[result, rightByQuery.get(result.queryId)!] as const] : []);
  const sharedIds = new Set(pairs.map(([result]) => result.queryId));
  const scoped = results.filter((result) => (result.scanId === before.id || result.scanId === after.id) && sharedIds.has(result.queryId));
  const leftScan = { ...before, queryCount: pairs.length };
  const rightScan = { ...after, queryCount: pairs.length };
  const leftMetric = measure(leftScan, scoped);
  const rightMetric = measure(rightScan, scoped);
  const gained = pairs.filter(([a, b]) => !a.mentions.some((mention) => mention.isTarget) && b.mentions.some((mention) => mention.isTarget)).map(([a]) => a);
  const lost = pairs.filter(([a, b]) => a.mentions.some((mention) => mention.isTarget) && !b.mentions.some((mention) => mention.isTarget)).map(([a]) => a);
  return { pairs, gained, lost, before: leftMetric, after: rightMetric };
}
export function comparisonCsv(before: ScanRun, after: ScanRun, results: QueryResult[]) {
  const comparison = compareScans(before, after, results);
  const rows = [["Query", "Before mentioned", "Before rank", "After mentioned", "After rank", "Change"]];
  for (const [left, right] of comparison.pairs) {
    const a = left.mentions.find((mention) => mention.isTarget); const b = right.mentions.find((mention) => mention.isTarget);
    rows.push([left.query, a ? "yes" : "no", a?.position?.toString() ?? "", b ? "yes" : "no", b?.position?.toString() ?? "", !a && b ? "gained" : a && !b ? "lost" : "unchanged"]);
  }
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
