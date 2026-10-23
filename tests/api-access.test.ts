import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/[action]/route";

test("production demo data and writes require no user session, even with a provider key configured", async () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  Object.assign(process.env, {
    NODE_ENV: "production",
    PERPLEXITY_API_KEY: "test-only-no-provider-call",
  });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const context = (action: string) => ({ params: Promise.resolve({ action }) });
  const request = (action: string, body: unknown) =>
    new NextRequest(`http://demo.test/api/${action}`, {
      method: "POST",
      headers: {
        origin: "http://demo.test",
        host: "demo.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    const response = await GET(
      new NextRequest("http://demo.test/api/dashboard"),
      context("dashboard"),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const data = await response.json();
    assert.equal(data.config.sonar, true);
    assert.equal("protected" in data.config, false);
    const draft = await POST(
      request("draft", { kind: "schema" }),
      context("draft"),
    );
    assert.equal(draft.status, 200);
    assert.equal((await draft.json()).kind, "schema");
    for (const action of ["login", "logout"])
      assert.equal(
        (await POST(request(action, {}), context(action))).status,
        404,
      );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("scan sizes, unknown query IDs, and cross-origin mutations are rejected", async () => {
  const post = (action: string, body: unknown, origin = "http://demo.test") =>
    POST(
      new NextRequest(`http://demo.test/api/${action}`, {
        method: "POST",
        headers: {
          origin,
          host: "demo.test",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ action }) },
    );
  assert.equal((await post("scan", { count: 1 })).status, 400);
  assert.equal((await post("scan", { count: 31 })).status, 400);
  assert.equal(
    (await post("scan", { count: 5 }, "http://other.test")).status,
    403,
  );
  assert.equal(
    (
      await post("queries", {
        queries: [
          {
            id: "unknown",
            text: "Test query for Pacific Beach",
            category: "Test",
            active: true,
          },
        ],
      })
    ).status,
    400,
  );
  assert.equal((await post("cancel", { id: "bad-id" })).status, 400);
});

test("CSV export downloads saved evidence and neutralizes spreadsheet formulas", async () => {
  const { getRepository } = await import("../src/lib/repositories/repository");
  const { randomUUID } = await import("node:crypto");
  const repo = getRepository();
  const id = randomUUID();
  await repo.startScan({
    id,
    restaurantId: "cafe-athena",
    status: "running",
    startedAt: new Date().toISOString(),
    queryCount: 1,
    successCount: 0,
    source: "live",
    querySet: "csv-test",
  });
  await repo.saveResult({
    id: randomUUID(),
    restaurantId: "cafe-athena",
    scanId: id,
    queryId: "greek-pb",
    query: "=TEST()",
    queryCategory: "Test",
    status: "unverified",
    answer: 'Original "quoted"\nanswer',
    citations: [],
    mentions: [],
    model: "fixture",
    createdAt: new Date().toISOString(),
    parseVersion: 2,
  });
  const response = await GET(
    new NextRequest(`http://demo.test/api/export?scanId=${id}`),
    { params: Promise.resolve({ action: "export" }) },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition")!, /attachment/);
  const csv = await response.text();
  assert.match(csv, /'=TEST\(\)/);
  assert.match(csv, /Original ""quoted""\nanswer/);
  assert.match(csv, /not measured/);
  await repo.finishScan(
    {
      id,
      restaurantId: "cafe-athena",
      status: "partial",
      startedAt: new Date().toISOString(),
      queryCount: 1,
      successCount: 0,
      source: "live",
      querySet: "csv-test",
    },
    [],
    [],
  );
});
