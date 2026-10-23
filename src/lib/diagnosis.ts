import type { QueryResult, Recommendation, WebsiteAudit } from "./types";
import { competitorsFor } from "./metrics";

export function diagnoseVisibility(
  restaurantId: string,
  results: QueryResult[],
  audit: WebsiteAudit,
): Recommendation[] {
  const valid = results.filter((result) => result.status === "success");
  const misses = valid.filter(
    (result) => !result.mentions.some((mention) => mention.isTarget),
  );
  const recommendations: Recommendation[] = [];
  if (misses.length) {
    recommendations.push({
      id: "diagnosis-visibility-gap",
      restaurantId,
      title: "Address the queries where Café Athena was absent",
      description:
        "Use the saved responses to identify the dining needs that did not surface Café Athena, then publish accurate, customer-useful details that address those needs.",
      priority: "high",
      category: "AI discovery",
      source: "scan",
      status: "open",
      evidence: `Café Athena was absent from ${misses.length} of ${valid.length} valid Sonar responses. Queries: ${misses.map((result) => result.query).join(" • ")}`,
      evidenceUrls: misses.flatMap((result) => result.citations).slice(0, 8),
      mechanism:
        "Clear, relevant first-party information may make the restaurant easier for search systems to associate with these needs. This is a hypothesis, not a ranking guarantee.",
      confidence: "high",
      effort: "medium",
    });
  }
  for (const check of audit.checks.filter((item) => item.status === "missing")) {
    recommendations.push({
      id: `diagnosis-audit-${check.label.toLowerCase().replace(/\W+/g, "-")}`,
      restaurantId,
      title: `Add or improve ${check.label.toLowerCase()}`,
      description: check.detail,
      priority: check.label.includes("structured") || check.label.includes("menu") ? "high" : "medium",
      category: "Website",
      source: "audit",
      status: "open",
      evidence: `Verified during the website audit: ${check.evidence ?? check.detail}`,
      evidenceUrls: check.url ? [check.url] : [audit.url],
      mechanism:
        "Improves the availability or clarity of first-party restaurant information for visitors and search systems; it does not guarantee an AI recommendation.",
      confidence: "high",
      effort: "small",
    });
  }
  const leader = competitorsFor(valid).find((competitor) => !competitor.isTarget);
  if (leader) {
    recommendations.push({
      id: "diagnosis-competitor-hypothesis",
      restaurantId,
      title: `Study the queries where ${leader.name} appeared`,
      description:
        "Compare the saved answer evidence with Café Athena’s verified site coverage before choosing a content or site change.",
      priority: "medium",
      category: "Competitive research",
      source: "scan",
      status: "open",
      evidence: `${leader.name} was named in ${leader.mentions} valid-response recommendation lists. This measures appearance in this sample only; it does not establish why the competitor appeared.`,
      mechanism:
        "Hypothesis: gaps in clear, first-party information may contribute to differences in sampled AI responses. Validate against the linked responses before acting.",
      confidence: "low",
      effort: "medium",
      hypothesis: true,
    });
  }
  return recommendations.slice(0, 5);
}
