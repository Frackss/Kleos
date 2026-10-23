import "server-only";
import { randomUUID } from "node:crypto";
import * as cheerio from "cheerio";
import { getRepository } from "@/lib/repositories/repository";
import type { Recommendation, WebsiteAudit } from "@/lib/types";
export interface WebsiteAuditService {
  audit(): Promise<WebsiteAudit>;
}
// This MVP intentionally audits only the demo customer's allowlisted public origin.
// No request-provided URL is ever fetched, and redirects are checked before following.
const allowedHosts = new Set(["cafeathena.com", "www.cafeathena.com"]);
async function fetchHomepage(): Promise<{ html: string; url: string }> {
  let url = "https://cafeathena.com/";
  const signal = AbortSignal.timeout(20_000);
  for (let redirects = 0; redirects < 4; redirects++) {
    const target = new URL(url);
    if (
      target.protocol !== "https:" ||
      !allowedHosts.has(target.hostname) ||
      target.port ||
      target.username ||
      target.password
    )
      throw new Error(
        "The website redirected outside the allowed Café Athena domain.",
      );
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      cache: "no-store",
      headers: { "User-Agent": "Kleos-Audit/1.0", Accept: "text/html" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Website returned an invalid redirect.");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok)
      throw new Error(
        `Website returned HTTP ${response.status}. No audit was saved.`,
      );
    if (!response.headers.get("content-type")?.includes("text/html"))
      throw new Error("Website did not return an HTML document.");
    if (!response.body) throw new Error("Website returned an empty document.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new Error("Website document exceeds the 2 MB audit limit.");
      }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks).toString("utf8"), url };
  }
  throw new Error("Website returned too many redirects.");
}
function containsRestaurantSchema(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRestaurantSchema);
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  const types = Array.isArray(object["@type"])
    ? object["@type"]
    : [object["@type"]];
  return (
    types.some((t) => t === "Restaurant" || t === "CafeOrCoffeeShop") ||
    Object.values(object).some(containsRestaurantSchema)
  );
}
export class CheerioAuditService implements WebsiteAuditService {
  async audit() {
    const { html, url } = await fetchHomepage();
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    const description =
      $('meta[name="description"]').attr("content")?.trim() ?? "";
    const h1 = $("h1")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    let hasRestaurantSchema = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        if (containsRestaurantSchema(JSON.parse($(el).text())))
          hasRestaurantSchema = true;
      } catch {
        /* Invalid JSON-LD is not evidence of valid schema. */
      }
    });
    const hasMenuLink = $("a[href]")
      .toArray()
      .some((el) => /menu/i.test($(el).text() + " " + $(el).attr("href")));
    const hasCanonical = Boolean($('link[rel="canonical"]').attr("href"));
    $("script,style,noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    const hasAddress = /1846\s+garnet/i.test(text);
    const repo = getRepository();
    const { restaurant } = await repo.read();
    const checks = [
      {
        label: "Descriptive page title",
        passed: Boolean(title),
        detail: title || "No title tag found in the homepage HTML.",
      },
      {
        label: "Meta description",
        passed: Boolean(description),
        detail: description || "No meta description found.",
      },
      {
        label: "Restaurant structured data",
        passed: hasRestaurantSchema,
        detail: hasRestaurantSchema
          ? "Restaurant or CafeOrCoffeeShop JSON-LD found. Full schema validity was not checked."
          : "No Restaurant or CafeOrCoffeeShop JSON-LD found in the initial HTML.",
      },
      {
        label: "Visible street address",
        passed: hasAddress,
        detail: hasAddress
          ? "1846 Garnet is present in homepage text."
          : "The supplied street address was not found in homepage text.",
      },
      {
        label: "Discoverable menu link",
        passed: hasMenuLink,
        detail: hasMenuLink
          ? "A link with menu text or URL was found."
          : "No menu link found in homepage HTML.",
      },
      {
        label: "Primary heading",
        passed: h1.length === 1,
        detail: `${h1.length} H1 headings found. A single descriptive H1 is recommended.`,
      },
      {
        label: "Canonical URL",
        passed: hasCanonical,
        detail: hasCanonical
          ? "Canonical link tag found."
          : "No canonical link tag found.",
      },
    ];
    const audit: WebsiteAudit = {
      id: randomUUID(),
      restaurantId: restaurant.id,
      createdAt: new Date().toISOString(),
      url,
      title,
      description,
      h1,
      hasRestaurantSchema,
      hasMenuLink,
      hasAddress,
      hasCanonical,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      checks,
      source: "live",
    };
    const recommendations: Recommendation[] = checks
      .filter((c) => !c.passed)
      .map((check, i) => ({
        id: `audit-${check.label.toLowerCase().replace(/\W+/g, "-")}`,
        restaurantId: restaurant.id,
        title: `Review: ${check.label.toLowerCase()}`,
        description: `${check.detail} Review and update your website, then run another audit.`,
        priority: i < 2 ? "high" : "medium",
        category: "Website",
        source: "audit",
        status: "open",
        evidence: `Homepage HTML fetched from ${url} at ${audit.createdAt}. ${check.detail}`,
      }));
    await repo.saveAudit(audit, recommendations);
    return audit;
  }
}
