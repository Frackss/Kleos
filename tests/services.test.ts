import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentSearchService,
  parseRecommendations,
  isTargetRestaurant,
  neutralPrompt,
  type SearchAnswer,
} from "../src/lib/services/search";
import {
  runScan,
  startScan,
  executeScan,
  cancelScan,
} from "../src/lib/services/scan";
import { getRepository } from "../src/lib/repositories/repository";
import { queries } from "../src/lib/seed";
const query = "best Greek restaurants in Pacific Beach";
const fixture: SearchAnswer = {
  answer: "1. **Example Bistro** — Test fixture only.",
  rawResponse: "fixture",
  citations: [],
  mentions: [
    {
      name: "Example Bistro",
      position: 1,
      isTarget: false,
      evidence: "fixture",
    },
  ],
  model: "fixture",
  status: "success",
  parseVersion: 2,
};
function reset() {
  (globalThis as unknown as { localLensStore?: unknown }).localLensStore =
    undefined;
}

test("30 stable active queries span seven categories; neutral prompt never injects target", () => {
  assert.equal(queries.length, 30);
  assert.equal(new Set(queries.map((q) => q.id)).size, 30);
  assert.equal(new Set(queries.map((q) => q.category)).size, 7);
  assert.ok(queries.every((q) => q.active && q.enabled));
  assert.doesNotMatch(neutralPrompt, /athena/i);
});
test("only numbered list names count; accents and exact aliases match, prose and source URLs do not", () => {
  const parsed = parseRecommendations(
    "Café Athena is nearby, but these are the recommendations:\n1. **Other Bistro** — Food [1].\n2. **Cafe Athena Restaurant** — Pacific Beach [2].\nSources: https://cafeathena.com",
    query,
  );
  assert.equal(parsed.status, "success");
  assert.equal(parsed.mentions.length, 2);
  assert.equal(parsed.mentions[1].position, 2);
  assert.equal(parsed.mentions[1].isTarget, true);
  const noTarget = parseRecommendations(
    "1. **Other Bistro** — Try this instead of Café Athena. Source: https://cafeathena.com",
    query,
  );
  assert.equal(
    noTarget.mentions.some((m) => m.isTarget),
    false,
  );
  assert.equal(
    isTargetRestaurant("Café Athena Express", "Pacific Beach", query),
    false,
  );
  assert.equal(isTargetRestaurant("Athena", "Greek restaurant", query), false);
  assert.equal(isTargetRestaurant("Athena", "1846 Garnet Ave", query), true);
  assert.equal(
    parseRecommendations(
      "1. **Café Athena** — Food\n3. **Other** — Food",
      query,
    ).status,
    "unverified",
  );
  assert.equal(
    parseRecommendations("Café Athena is good", query).status,
    "unverified",
  );
  assert.equal(
    parseRecommendations(
      "1. **Cafe Athena** — Food\n2. **Café Athena** — Food",
      query,
    ).status,
    "unverified",
  );
});
test("Agent API preserves raw text, usage and citations; retries 429 and marks truncation unverified", async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.PERPLEXITY_API_KEY;
  process.env.PERPLEXITY_API_KEY = "test-only-fixture";
  let calls = 0;
  const raw = {
    model: "fixture",
    created_at: 1784292153,
    status: "completed",
    usage: { total_tokens: 200 },
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "1. **Café Athena** — Greek dining in Pacific Beach. [7]\n2. **Other Bistro** — Test.",
          },
        ],
      },
      {
        type: "search_results",
        results: [
          { id: 7, url: "https://example.com/source" },
          { id: 8, url: "javascript:alert(1)" },
        ],
      },
    ],
  };
  globalThis.fetch = async (_url, options) => {
    assert.equal(_url, "https://api.perplexity.ai/v1/responses");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.effort, "fast");
    assert.deepEqual(body.tools, [{ type: "web_search" }]);
    assert.equal(body.input, query);
    assert.doesNotMatch(body.instructions, /athena/i);
    calls++;
    return calls === 1
      ? new Response("", { status: 429 })
      : new Response(JSON.stringify(raw));
  };
  try {
    const r = await new AgentSearchService().search(query);
    assert.equal(calls, 2);
    assert.deepEqual(r.citationIds, ["7"]);
    assert.equal(r.status, "success");
    assert.equal(r.rawResponse, JSON.stringify(raw));
    assert.equal(r.usage?.total_tokens, 200);
    assert.deepEqual(r.citations, ["https://example.com/source"]);
    raw.status = "incomplete";
    const truncated = await new AgentSearchService().search(query);
    assert.equal(truncated.status, "unverified");
    assert.ok(truncated.answer);
    assert.match(truncated.error!, /truncated/);
    raw.status = "completed";
    raw.output = raw.output.filter((item) => item.type !== "search_results");
    const ungrounded = await new AgentSearchService().search(query);
    assert.equal(ungrounded.status, "unverified");
    assert.match(ungrounded.error!, /No resolvable web citations/);
    globalThis.fetch = async () => new Response("", { status: 401 });
    await assert.rejects(new AgentSearchService().search(query), /rejected/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = originalKey;
  }
});
test("scan concurrency is two, persists results before completion, and excludes failed requests", async () => {
  reset();
  const oldKey = process.env.PERPLEXITY_API_KEY;
  process.env.PERPLEXITY_API_KEY = "fixture";
  let active = 0,
    maximum = 0,
    calls = 0,
    sawSaved = false;
  try {
    const scan = await runScan(
      {
        async search() {
          const n = ++calls;
          active++;
          maximum = Math.max(maximum, active);
          await new Promise((r) => setTimeout(r, 10));
          if (n > 2)
            sawSaved = (await getRepository().read()).results.length > 0;
          active--;
          if (n === 2) throw new Error("Fixture timeout");
          return fixture;
        },
      },
      5,
    );
    assert.equal(maximum, 2);
    assert.equal(sawSaved, true);
    assert.equal(scan.status, "partial");
    assert.equal(scan.successCount, 4);
    assert.equal(scan.completedCount, 5);
    assert.equal((await getRepository().read()).results.length, 5);
    delete process.env.PERPLEXITY_API_KEY;
    await assert.rejects(startScan(), /not connected/);
  } finally {
    if (oldKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = oldKey;
    reset();
  }
});
test("cancellation retains finished results and prevents remaining calls", async () => {
  reset();
  const oldKey = process.env.PERPLEXITY_API_KEY;
  process.env.PERPLEXITY_API_KEY = "fixture";
  try {
    const scan = await startScan(5);
    let calls = 0;
    const finished = await executeScan(scan, {
      async search() {
        calls++;
        if (calls === 2) await cancelScan(scan.id);
        return fixture;
      },
    });
    assert.equal(finished.status, "cancelled");
    assert.ok(calls <= 2);
    assert.ok((await getRepository().read()).results.length > 0);
  } finally {
    if (oldKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = oldKey;
    reset();
  }
});

test("provider endpoint retirement is distinguished from authentication and raw error is retained", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PERPLEXITY_API_KEY;
  process.env.PERPLEXITY_API_KEY = "fixture";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          type: "chat_completions_not_available",
          message: "Use /v1/responses",
          code: 403,
        },
      }),
      { status: 403 },
    );
  try {
    await assert.rejects(
      new AgentSearchService().search(query),
      (error) =>
        error instanceof Error &&
        /disabled Sonar/.test(error.message) &&
        "rawResponse" in error &&
        String(error.rawResponse).includes("chat_completions_not_available"),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = originalKey;
  }
});
