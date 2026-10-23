import type { Measurement, QueryResult, SearchQuery } from "./types";

const topics = [
  {
    id: "cuisine",
    label: "Greek food",
    intent: "Cuisine discovery",
    category: "Greek / Mediterranean",
  },
  {
    id: "dietary",
    label: "Dietary options",
    intent: "Dietary preference",
    category: "Dietary options",
  },
  {
    id: "happy-hour",
    label: "Happy hour",
    intent: "Occasion discovery",
    category: "Happy hour",
  },
  {
    id: "groups",
    label: "Events & groups",
    intent: "Group dining",
    category: "Catering / private dining",
  },
  {
    id: "date-night",
    label: "Date night",
    intent: "Date night",
    category: "Date nights",
  },
];

export function topicCoverage(queries: SearchQuery[], results: QueryResult[]) {
  return topics.map((topic) => {
    const matching = queries.filter((q) =>
      q.category ? q.category === topic.category : q.intent === topic.intent,
    );
    const answers = results.filter(
      (r) =>
        r.status === "success" &&
        (r.queryCategory
          ? r.queryCategory === topic.category
          : matching.some((q) => q.id === r.queryId)),
    );
    const mentioned = answers.filter((r) =>
      r.mentions.some((m) => m.isTarget),
    ).length;
    return {
      ...topic,
      tracked: matching.some((q) => q.enabled) || answers.length > 0,
      count: answers.length,
      mentioned,
      rate: answers.length
        ? Math.round((mentioned / answers.length) * 100)
        : null,
    };
  });
}

// Compare only complete scans with the same query set. No claim of causality.
export function comparableMentionDelta(measurements: Measurement[]) {
  const latest = measurements.at(-1);
  if (!latest || latest.successfulQueries !== latest.totalQueries) return null;
  const previous = measurements
    .slice(0, -1)
    .findLast(
      (m) =>
        m.querySet === latest.querySet &&
        m.successfulQueries === m.totalQueries &&
        m.totalQueries === latest.totalQueries,
    );
  return previous ? latest.mentionRate - previous.mentionRate : null;
}
