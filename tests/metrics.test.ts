import { test } from "node:test";
import assert from "node:assert/strict";
import {
  competitorKey,
  competitorsFor,
  measure,
  normalizeName,
} from "../src/lib/metrics";
import type { QueryResult, ScanRun } from "../src/lib/types";
const scan: ScanRun = {
  id: "scan-1",
  restaurantId: "cafe-athena",
  status: "partial",
  startedAt: "2026-10-23T00:00:00Z",
  queryCount: 3,
  successCount: 2,
  source: "live",
  querySet: "test",
};
function result(id: string, overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    id,
    restaurantId: "cafe-athena",
    scanId: scan.id,
    queryId: id,
    query: "test query",
    status: "success",
    answer: "Test fixture, not a real search result",
    citations: [],
    mentions: [],
    model: "test-fixture",
    createdAt: scan.startedAt,
    ...overrides,
  };
}
test("no successful queries means no measurement, not a zero score", () => {
  assert.equal(measure(scan, []), null);
  assert.equal(measure(scan, [result("failed", { status: "failed" })]), null);
});
test("missing mentions count against visibility; failed queries do not", () => {
  const rows = [
    result("a", {
      mentions: [
        { name: "Café Athena", isTarget: true, position: 2, evidence: "test" },
      ],
    }),
    result("b"),
    result("c", { status: "failed" }),
  ];
  const m = measure(scan, rows)!;
  assert.equal(m.visibilityScore, 25);
  assert.equal(m.mentionRate, 50);
  assert.equal(m.averagePosition, 2);
  assert.equal(m.successfulQueries, 2);
});
test("unranked mentions count toward mention rate, but never invent a position", () => {
  const m = measure(scan, [
    result("a", {
      mentions: [
        {
          name: "Café Athena",
          isTarget: true,
          position: null,
          evidence: "test",
        },
      ],
    }),
  ])!;
  assert.equal(m.mentionRate, 100);
  assert.equal(m.visibilityScore, 0);
  assert.equal(m.averagePosition, null);
});
test("restaurant mentions are deduplicated within each query and normalized", () => {
  const rows = [
    result("a", {
      mentions: [
        { name: "Café Athena", isTarget: true, position: 1, evidence: "test" },
        { name: "Cafe Athena", isTarget: true, position: 1, evidence: "test" },
        {
          name: "Example Bistro",
          isTarget: false,
          position: 2,
          evidence: "test",
        },
      ],
    }),
  ];
  const c = competitorsFor(rows);
  assert.equal(c.length, 2);
  assert.equal(c.find((c) => c.isTarget)?.shareOfVoice, 50);
  assert.equal(normalizeName("Café Athena"), normalizeName("Cafe Athena"));
});
test("measurements exclude results belonging to other scans", () => {
  assert.equal(measure(scan, [result("a", { scanId: "other" })]), null);
});

test("unverified and cancelled responses never count as absences or mentions", () => {
  const rows = [
    result("a", {
      status: "unverified",
      mentions: [
        {
          name: "Café Athena",
          isTarget: true,
          position: null,
          evidence: "uncertain",
        },
      ],
    }),
    result("b", { status: "cancelled" }),
  ];
  assert.equal(measure(scan, rows), null);
  assert.deepEqual(competitorsFor(rows), []);
});

test("local competitor aliases merge into a single share-of-voice entry", () => {
  const rows = [
    result("a", {
      mentions: [
        {
          name: "PB AleHouse",
          isTarget: false,
          position: 1,
          evidence: "fixture",
        },
      ],
    }),
    result("b", {
      mentions: [
        {
          name: "Pacific Beach AleHouse",
          isTarget: false,
          position: 2,
          evidence: "fixture",
        },
      ],
    }),
  ];
  const competitors = competitorsFor(rows);
  assert.equal(competitors.length, 1);
  assert.equal(competitors[0].mentions, 2);
  assert.equal(competitors[0].shareOfVoice, 100);
  assert.equal(
    competitorKey("Slowly Restaurant & Lounge"),
    competitorKey("Slowly Restaurant and Lounge"),
  );
});
