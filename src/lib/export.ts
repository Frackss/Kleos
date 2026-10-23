import type { QueryResult } from "./types";
function cell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]|^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function discoveryCsv(results: QueryResult[]) {
  const rows: unknown[][] = [
    [
      "Query ID",
      "Query",
      "Category",
      "Status",
      "Target mentioned",
      "Rank",
      "Competitors",
      "Citations",
      "Model",
      "Timestamp",
      "Original response",
      "Error",
    ],
  ];
  for (const r of results)
    rows.push([
      r.queryId,
      r.query,
      r.queryCategory,
      r.status,
      r.status === "success"
        ? r.mentions.some((m) => m.isTarget)
          ? "yes"
          : "no"
        : "not measured",
      r.status === "success"
        ? r.mentions.find((m) => m.isTarget)?.position
        : "",
      r.status === "success"
        ? r.mentions
            .filter((m) => !m.isTarget)
            .map((m) => m.name)
            .join(" | ")
        : "not verified",
      r.citations.join(" | "),
      r.model,
      r.createdAt,
      r.answer,
      r.error,
    ]);
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
