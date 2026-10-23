import type { Competitor, Measurement, QueryResult, ScanRun } from "./types";
export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function competitorKey(name: string) {
  const normalized = normalizeName(name.replace(/&/g, " and ")).replace(
    /restaurant$/,
    "",
  );
  const aliases: Record<string, string> = {
    thekebabshop: "kebabshop",
    pbalehouse: "pacificbeachalehouse",
    georgesatthecove: "georgesatthecove",
    georgesatthecovelajolla: "georgesatthecove",
    cafeathenarestaurant: "cafeathena",
  };
  return aliases[normalized] ?? normalized;
}
export function competitorsFor(results: QueryResult[]): Competitor[] {
  const counts = new Map<
    string,
    { name: string; mentions: number; positions: number[]; isTarget: boolean }
  >();
  for (const result of results.filter((r) => r.status === "success")) {
    const seen = new Set<string>();
    for (const mention of result.mentions) {
      const key = mention.isTarget ? "cafeathena" : competitorKey(mention.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const item = counts.get(key) ?? {
        name: mention.isTarget ? "Café Athena" : mention.name,
        mentions: 0,
        positions: [],
        isTarget: mention.isTarget,
      };
      item.mentions++;
      if (mention.position !== null) item.positions.push(mention.position);
      counts.set(key, item);
    }
  }
  const total = [...counts.values()].reduce((s, c) => s + c.mentions, 0);
  return [...counts.values()]
    .map((c) => ({
      name: c.name,
      mentions: c.mentions,
      isTarget: c.isTarget,
      shareOfVoice: total ? (c.mentions / total) * 100 : 0,
      averagePosition: c.positions.length
        ? c.positions.reduce((a, b) => a + b, 0) / c.positions.length
        : null,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}
export function competitorWins(
  results: QueryResult[],
  competitorName: string,
) {
  const key = competitorKey(competitorName);
  return results.filter((result) => {
    if (result.status !== "success") return false;
    const competitor = result.mentions.find(
      (mention) => !mention.isTarget && competitorKey(mention.name) === key,
    );
    if (!competitor) return false;
    const target = result.mentions.find((mention) => mention.isTarget);
    return !target ||
      (competitor.position !== null &&
        (target.position === null || competitor.position < target.position));
  });
}
export function measure(
  scan: ScanRun,
  allResults: QueryResult[],
): Measurement | null {
  const results = allResults.filter(
    (r) => r.scanId === scan.id && r.status === "success",
  );
  if (!results.length) return null;
  const target = results.map((r) => r.mentions.find((m) => m.isTarget));
  const positions = target.flatMap((m) =>
    m?.position != null ? [m.position] : [],
  );
  const rate = (target.filter(Boolean).length / results.length) * 100;
  // Mean reciprocal rank across all successful queries; absent/unranked = zero.
  const score =
    (target.reduce((sum, m) => sum + (m?.position ? 1 / m.position : 0), 0) /
      results.length) *
    100;
  return {
    scanId: scan.id,
    createdAt: scan.completedAt ?? scan.startedAt,
    visibilityScore: Math.round(score),
    mentionRate: Math.round(rate),
    averagePosition: positions.length
      ? positions.reduce((a, b) => a + b, 0) / positions.length
      : null,
    shareOfVoice:
      competitorsFor(results).find((c) => c.isTarget)?.shareOfVoice ?? 0,
    successfulQueries: results.length,
    totalQueries: scan.queryCount,
    querySet: scan.querySet,
  };
}
