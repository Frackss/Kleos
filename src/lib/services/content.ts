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
function publishHtml(restaurant: { name: string; address: string; website: string }, content: { heroHeadline: string; description: string; faq: { question: string; answer: string }[]; internalLinks: string[] }) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<main><section><p>Pacific Beach · San Diego</p><h1>${escape(content.heroHeadline)}</h1><p>${escape(content.description)}</p><a href="${restaurant.website}">Visit Café Athena</a></section><section><h2>Questions diners ask</h2>${content.faq.map((item) => `<article><h3>${escape(item.question)}</h3><p>${escape(item.answer)}</p></article>`).join("")}</section><nav aria-label="Suggested internal links">${content.internalLinks.map((item) => `<a href="#">${escape(item)}</a>`).join(" · ")}</nav></main>`;
}
function validatePublishPackage(value: unknown, restaurant: { name: string; website: string; address: string; cuisine: string }) {
  const item = value as Record<string, unknown>;
  const faq = Array.isArray(item.faq) ? item.faq.filter((entry): entry is { question: string; answer: string } => Boolean(entry && typeof (entry as { question?: unknown }).question === "string" && typeof (entry as { answer?: unknown }).answer === "string")).slice(0, 6) : [];
  if (typeof item.title !== "string" || typeof item.metaDescription !== "string" || typeof item.heroHeadline !== "string" || typeof item.description !== "string" || faq.length < 2 || !Array.isArray(item.internalLinks) || typeof item.jsonLd !== "string") throw new Error("Sonar returned an incomplete publish package. Try generate again.");
  const jsonLd = validateSchema(item.jsonLd);
  const internalLinks = item.internalLinks.filter((entry): entry is string => typeof entry === "string").slice(0, 5);
  return { title: item.title.slice(0, 70), metaDescription: item.metaDescription.slice(0, 170), heroHeadline: item.heroHeadline.slice(0, 140), faq, internalLinks, jsonLd, html: publishHtml(restaurant, { heroHeadline: item.heroHeadline, description: item.description, faq, internalLinks }) };
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
  async createPublishFix(recommendationId?: string) {
    const repo = getRepository(); const data = await repo.read(); const recommendation = data.recommendations.find((item) => item.id === recommendationId); const audit = data.audits[0];
    const prompt = `Return ONLY a JSON object with title, metaDescription, heroHeadline, description, faq (array of question and answer), internalLinks (array of short link labels), and jsonLd (a JSON string). Create a publish-ready local landing page for the supplied search opportunity. FAQ content is intended to appear visibly on the page. Use no unverified claims. JSON-LD must be a Restaurant object with @context, @type, name, url, servesCuisine and PostalAddress only; include hasMenu only if verified.\n\nSearch opportunity: ${recommendation?.evidence ?? "Best date night restaurants in Pacific Beach"}\nRestaurant: ${data.restaurant.name}\nWebsite: ${data.restaurant.website}\nAddress: ${data.restaurant.address}\nCuisine: ${data.restaurant.cuisine}\nVerified audit facts: ${audit?.checks.filter((check) => check.status === "present").map((check) => check.label).join("; ") ?? "No audit findings"}\nUser-supplied details: ${data.restaurant.highlights.join("; ")}`;
    const raw = await draftWithSonar(prompt);
    let packageValue: unknown; try { packageValue = JSON.parse(raw); } catch { throw new Error("Sonar did not return a valid publish package. Try generate again."); }
    const publish = validatePublishPackage(packageValue, data.restaurant);
    const now = new Date().toISOString(); const baseline = data.scans.find((scan) => scan.status === "completed" || scan.status === "partial");
    const opportunityQuery = data.queries.find((query) => /date night|romantic|cocktails/i.test(query.text)) ?? data.queries[0];
    const draft: ContentDraft = { id: randomUUID(), restaurantId: data.restaurant.id, kind: "landing", title: "Publish-ready local landing page", body: publish.html, rationale: recommendation?.description ?? "A Sonar-generated local page based on supplied details and verified audit findings.", visibilityGap: recommendation?.evidence, recommendationId, model: searchModelLabel(), publish: { ...publish, baselineScanId: baseline?.id, followUpScanIds: [], queryId: opportunityQuery?.id }, history: [{ at: now, action: "created", detail: "Search analyzed and publish fix generated" }], createdAt: now, source: "sonar", status: "draft" };
    await repo.saveDraft(draft); return draft;
  }
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
