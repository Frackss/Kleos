import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { load } from "cheerio";
import { getRepository } from "@/lib/repositories/repository";
import type { ContentDraft } from "@/lib/types";

function isPrivateAddress(address: string) {
  if (net.isIP(address) === 4) { const [a, b] = address.split(".").map(Number); return a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168; }
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}
async function assertPublicUrl(input: string) {
  const url = new URL(input); if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an http or https URL.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local and private URLs cannot be verified.");
  const records = await dns.lookup(url.hostname, { all: true }); if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error("Private network URLs cannot be verified."); return url;
}
async function fetchPublic(input: string) { let url = await assertPublicUrl(input); for (let i = 0; i < 4; i++) { const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Kleos-Publish-Verify/1.0", Accept: "text/html" } }); if (response.status >= 300 && response.status < 400) { const location = response.headers.get("location"); if (!location) throw new Error("The published page redirected without a destination."); url = await assertPublicUrl(new URL(location, url).toString()); continue; } return { response, url }; } throw new Error("Too many redirects while verifying the published page."); }
export async function verifyPublication(id: string, publishedUrl: string) {
  const repo = getRepository(); const data = await repo.read(); const draft = data.drafts.find((item) => item.id === id); if (!draft?.publish) throw new Error("Publish package not found."); if (draft.status === "draft") throw new Error("Approve this fix before verifying a published page.");
  const publish = draft.publish; const { response, url } = await fetchPublic(publishedUrl); const html = response.ok ? (await response.text()).slice(0, 2_000_000) : ""; const $ = load(html); const body = $("body").text().replace(/\s+/g, " ").toLowerCase(); const title = $("title").text().trim(); const description = $("meta[name='description']").attr("content") ?? ""; const robots = $("meta[name='robots']").attr("content") ?? ""; const structured = $("script[type='application/ld+json']").text(); const checks = [
    { label: "HTTP response", passed: response.ok, detail: `Received HTTP ${response.status}.` },
    { label: "Generated page content", passed: body.includes(publish.heroHeadline.toLowerCase().slice(0, 24)), detail: "Hero headline was checked in visible page text." },
    { label: "Title", passed: title.toLowerCase().includes(publish.title.toLowerCase().slice(0, 24)), detail: "Generated title was checked." },
    { label: "Meta description", passed: description.toLowerCase().includes(publish.metaDescription.toLowerCase().slice(0, 24)), detail: "Generated meta description was checked." },
    { label: "Relevant heading", passed: $("h1,h2").toArray().some((node) => $(node).text().toLowerCase().includes(publish.heroHeadline.toLowerCase().slice(0, 24))), detail: "Generated hero heading was checked." },
    { label: "Structured data", passed: structured.includes("Restaurant") && structured.includes("Café Athena"), detail: "Restaurant JSON-LD was checked." },
    { label: "Indexing directive", passed: !/noindex/i.test(robots), detail: /noindex/i.test(robots) ? "Page declares noindex." : "No noindex meta directive found." },
  ]; const now = new Date().toISOString(); const passed = checks.every((check) => check.passed); const next: ContentDraft = { ...draft, status: passed ? "verified" : "published", updatedAt: now, publish: { ...draft.publish, publishingMethod: "manual", publishedUrl: url.toString(), verification: { status: passed ? "passed" : "failed", checkedAt: now, httpStatus: response.status, checks } }, history: [...(draft.history ?? []), { at: now, action: "published", detail: url.toString() }, { at: now, action: "verified", detail: passed ? "Published and verified" : "Verification needs attention" }] }; await repo.updateDraft(next); return next;
}
