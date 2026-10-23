import { test } from "node:test";
import assert from "node:assert/strict";
import { comparableMentionDelta, topicCoverage } from "../src/lib/overview";
import { queries } from "../src/lib/seed";
import type { Measurement, QueryResult } from "../src/lib/types";
function result(
  queryId: string,
  status: "success" | "failed",
  mentioned: boolean,
): QueryResult {
  return {
    id: queryId,
    restaurantId: "cafe-athena",
    scanId: "test",
    queryId,
    query: "test fixture",
    status,
    answer: "",
    citations: [],
    mentions: mentioned
      ? [
          {
            name: "Café Athena",
            isTarget: true,
            position: 1,
            evidence: "fixture",
          },
        ]
      : [],
    model: "fixture",
    createdAt: "2026-10-23T00:00:00Z",
  };
}
const measurement: Measurement = {
  scanId: "a",
  createdAt: "2026-10-23T00:00:00Z",
  visibilityScore: 25,
  mentionRate: 50,
  averagePosition: 2,
  shareOfVoice: 20,
  successfulQueries: 3,
  totalQueries: 3,
  querySet: "same",
};
test("topic coverage distinguishes no answer, no mention, and no query", () => {
  const rows = topicCoverage(queries, [
    result("greek-pb", "success", true),
    result("happy-hour", "success", false),
    result("vegetarian", "failed", false),
  ]);
  assert.equal(rows.find((r) => r.id === "cuisine")?.rate, 100);
  assert.equal(rows.find((r) => r.id === "happy-hour")?.rate, 0);
  assert.equal(rows.find((r) => r.id === "dietary")?.rate, null);
  assert.equal(rows.find((r) => r.id === "dietary")?.tracked, true);
  assert.equal(rows.find((r) => r.id === "groups")?.tracked, true);
  assert.equal(rows.find((r) => r.id === "date-night")?.rate, null);
});
test("mention deltas exclude partial scans and changed query sets", () => {
  assert.equal(comparableMentionDelta([]), null);
  assert.equal(comparableMentionDelta([measurement]), null);
  assert.equal(
    comparableMentionDelta([
      measurement,
      { ...measurement, mentionRate: 100, successfulQueries: 2 },
    ]),
    null,
  );
  assert.equal(
    comparableMentionDelta([
      measurement,
      { ...measurement, mentionRate: 100, querySet: "different" },
    ]),
    null,
  );
  assert.equal(
    comparableMentionDelta([
      measurement,
      { ...measurement, mentionRate: 100, successfulQueries: 2 },
      { ...measurement, mentionRate: 75 },
    ]),
    25,
  );
});
