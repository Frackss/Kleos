import "server-only";
import { randomUUID } from "node:crypto";
import { getRepository } from "@/lib/repositories/repository";
import { searchConfiguration, searchModelLabel } from "./search";
import type { ContentDraft } from "@/lib/types";

const labels: Record<ContentDraft["kind"], string> = {
  about: "About page rewrite", faq: "Local-search FAQ section", schema: "Restaurant JSON-LD", menu: "Menu description improvements", landing: "Local landing page", outreach: "Local food writer outreach email", description: "Restaurant description",
};
async function fetchMenuBaseline() {
  const url = "https://cafeathena.com/lunch-dinner-menu/";
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Kleos-Content-Audit/1.0", Accept: "text/html" } });
  if (!response.ok) return { url, content: null };
  const html = await response.text();
  if (html.length > 2_000_000) return { url, content: null };
  const { load } = await import("cheerio");
  const $ = load(html);
  $("script,style,noscript,nav,footer").remove();
  const content = $("main").text().replace(/\s+/g, " ").trim() || $("body").text().replace(/\s+/g, " ").trim();
  return { url, content: content.slice(0, 24_000) || null };
}
function instruction(kind: ContentDraft["kind"]) {
  const format: Record<ContentDraft["kind"], string> = {
    about: "Write publish-ready About page copy with a heading and 2–4 short paragraphs.",
    faq: "Write 4–6 FAQ entries with concise Q/A pairs intended to appear visibly on the page. Do not include FAQPage JSON-LD.",
    schema: "Return only valid JSON-LD, no markdown fences.",
    menu: "Write clear, factual menu-section descriptions without inventing dishes, prices, ingredients, or availability.",
    landing: "Write a local landing page with an H1, short introduction, and useful sections. Use only supplied facts.",
    outreach: "Write a respectful, personalized draft email. Do not claim endorsements, reviews, awards, or prior contact.",
    description: "Write a concise local restaurant description using only the supplied facts.",
  };
  return format[kind];
}
function validateSchema(body: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error("Sonar returned invalid JSON-LD. Try regenerate."); }
  const object = parsed as Record<string, unknown>;
  const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
  if (!types.includes("Restaurant") || !object.name || !object.address || !object.url || !object.servesCuisine)
    throw new Error("Generated JSON-LD is missing required Restaurant, address, cuisine, or URL fields.");
  if ("aggregateRating" in object || "review" in object || "menuItem" in object || "priceRange" in object)
    throw new Error("Generated JSON-LD includes unsupported ratings, reviews, menu items, or prices.");
  return JSON.stringify(object, null, 2);
}
async function draftWithSonar(prompt: string) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("Live search is not connected. Add PERPLEXITY_API_KEY and restart.");
  const response = await fetch("https://api.perplexity.ai/v1/responses", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(75_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...searchConfiguration(), input: prompt, max_output_tokens: 2200, instructions: "You are a careful restaurant content editor. Draft only from the supplied verified or user-supplied facts. Never invent reviews, ratings, awards, menu items, prices, testimonials, endorsements, opening hours, or third-party facts. Do not promise search or AI ranking improvements. Return only the requested content." }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Perplexity content request failed (${response.status}).`);
  try {
    const json = JSON.parse(raw) as { output?: { type?: string; role?: string; content?: { type?: string; text?: string }[] }[] };
    const body = json.output?.filter((item) => item.type === "message" && item.role === "assistant").flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("\n").trim();
    if (!body) throw new Error();
    return body;
  } catch { throw new Error("Perplexity returned an unusable content response. Try again."); }
}

export class SonarContentService {
  async create(kind: ContentDraft["kind"], recommendationId?: string, regenerateOf?: string) {
    const repo = getRepository();
    const data = await repo.read();
    const recommendation = data.recommendations.find((item) => item.id === recommendationId);
    const audit = data.audits[0];
    const menuBaseline = kind === "menu" ? await fetchMenuBaseline() : null;
    const verifiedMenuUrl = audit?.menuPages?.[0];
    const facts = [
      `Restaurant: ${data.restaurant.name}`, `Website: ${data.restaurant.website}`, `Address: ${data.restaurant.address}`, `Cuisine: ${data.restaurant.cuisine}`, `Opened: ${data.restaurant.opened}`,
      `User-supplied business details: ${data.restaurant.highlights.join("; ")}`,
      `Verified audit findings: ${audit ? audit.checks.map((check) => `${check.label}: ${check.status}`).join("; ") : "No audit has been run."}`,
      verifiedMenuUrl ? `Verified menu URL: ${verifiedMenuUrl}` : "No verified menu URL. Do not include one.",
      "Opening hours have not been verified as structured facts. Do not include hours.",
      menuBaseline?.content ? `Existing lunch/dinner menu baseline from ${menuBaseline.url}:\n${menuBaseline.content}` : "Menu baseline unavailable; do not invent menu content.",
      recommendation ? `Associated visibility gap: ${recommendation.evidence}` : "No specific recommendation was selected.",
    ].join("\n");
    const schemaRules = kind === "schema" ? "For JSON-LD use @context https://schema.org, @type Restaurant, name, url, servesCuisine, and PostalAddress. Include hasMenu only with the verified menu URL. Do not include FAQPage, openingHours, ratings, reviews, prices, or menu items." : "";
    let body = await draftWithSonar(`${instruction(kind)}\n\n${schemaRules}\n\nFacts:\n${facts}`);
    if (kind === "schema") body = validateSchema(body);
    const now = new Date().toISOString();
    if (regenerateOf) {
      const previous = data.drafts.find((draft) => draft.id === regenerateOf);
      if (!previous) throw new Error("Draft not found.");
      const next: ContentDraft = { ...previous, body, updatedAt: now, source: "sonar", model: searchModelLabel(), history: [...(previous.history ?? []), { at: now, action: "regenerated" }] };
      await repo.updateDraft(next);
      return next;
    }
    const original = kind === "about" ? audit?.aboutContent ?? null : menuBaseline?.content ?? null;
    const originalUrl = kind === "about" ? audit?.aboutUrl ?? null : menuBaseline?.url ?? null;
    const draft: ContentDraft = { id: randomUUID(), restaurantId: data.restaurant.id, kind, title: labels[kind], body, original, originalUrl, rationale: recommendation?.description ?? "Generated from Café Athena’s supplied profile and latest website audit.", visibilityGap: recommendation?.evidence, recommendationId, model: searchModelLabel(), history: [{ at: now, action: "created" }], createdAt: now, source: "sonar", status: "draft" };
    await repo.saveDraft(draft);
    return draft;
  }
  async update(id: string, body?: string, approve?: boolean, event?: "copied" | "exported") {
    const repo = getRepository(); const data = await repo.read(); const draft = data.drafts.find((item) => item.id === id);
    if (!draft) throw new Error("Draft not found.");
    const now = new Date().toISOString(); let nextBody = body ?? draft.body;
    if (draft.kind === "schema") nextBody = validateSchema(nextBody);
    const action = approve ? "approved" : event ?? (body !== undefined ? "edited" : "edited");
    const next: ContentDraft = { ...draft, body: nextBody, status: approve ? "approved" : draft.status, updatedAt: now, history: [...(draft.history ?? []), { at: now, action }] };
    await repo.updateDraft(next); return next;
  }
}
