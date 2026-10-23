import "server-only";
import { randomUUID } from "node:crypto";
import * as cheerio from "cheerio";
import { getRepository } from "@/lib/repositories/repository";
import type { Recommendation, WebsiteAudit } from "@/lib/types";
import { diagnoseVisibility } from "@/lib/diagnosis";
export interface WebsiteAuditService {
  audit(): Promise<WebsiteAudit>;
}
// This MVP intentionally audits only the demo customer's allowlisted public origin.
// No request-provided URL is ever fetched, and redirects are checked before following.
const allowedHosts = new Set(["cafeathena.com", "www.cafeathena.com"]);
async function fetchPage(startUrl: string): Promise<{ html: string; url: string }> {
  let url = startUrl;
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
    if (response.status === 401 || response.status === 403)
      throw new Error(
        `Website blocked this audit with HTTP ${response.status}. No audit was saved.`,
      );
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
    const { html, url } = await fetchPage("https://cafeathena.com/");
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    const description =
      $('meta[name="description"]').attr("content")?.trim() ?? "";
    const h1 = $("h1")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    const h2 = $("h2")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
    const internalLinks = $("a[href]")
      .toArray()
      .flatMap((el) => {
        const href = $(el).attr("href");
        if (!href) return [];
        try {
          const target = new URL(href, url);
          if (!allowedHosts.has(target.hostname) || target.protocol !== "https:") return [];
          return [{ text: $(el).text().replace(/\s+/g, " ").trim(), url: target.href }];
        } catch {
          return [];
        }
      })
      .filter((link, index, links) => link.url !== url && links.findIndex((item) => item.url === link.url) === index)
      .slice(0, 100);
    const menuCandidates = internalLinks
      .filter((link) => /menu|food|order/i.test(`${link.text} ${link.url}`))
      .slice(0, 3);
    const aboutCandidate = internalLinks.find((link) => /about|our story/i.test(`${link.text} ${link.url}`));
    const menuPages: string[] = [];
    await Promise.all(
      menuCandidates.map(async (link) => {
        try {
          const page = await fetchPage(link.url);
          menuPages.push(page.url);
        } catch {
          // A linked page that blocks or fails is not represented as audited content.
        }
      }),
    );
    let aboutUrl: string | null = null;
    let aboutContent: string | null = null;
    if (aboutCandidate) {
      try {
        const page = await fetchPage(aboutCandidate.url);
        const about$ = cheerio.load(page.html);
        about$("script,style,noscript,nav,footer").remove();
        aboutUrl = page.url;
        aboutContent = about$("main").text().replace(/\s+/g, " ").trim() || about$("body").text().replace(/\s+/g, " ").trim();
      } catch {
        // The original remains unavailable when a real page cannot be retrieved.
      }
    }
    let hasRestaurantSchema = false;
    const jsonLd: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).text());
        jsonLd.push(JSON.stringify(parsed).slice(0, 4000));
        if (containsRestaurantSchema(parsed))
          hasRestaurantSchema = true;
      } catch {
        /* Invalid JSON-LD is not evidence of valid schema. */
      }
    });
    const hasMenuLink = menuCandidates.length > 0;
    const hasCanonical = Boolean(canonicalUrl);
    $("script,style,noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    const hasAddress = /1846\s+garnet/i.test(text);
    const repo = getRepository();
    const { restaurant } = await repo.read();
    const normalized = text.toLowerCase();
    const check = (label: string, passed: boolean, detail: string, evidence?: string) => ({
      label, passed, status: passed ? ("present" as const) : ("missing" as const), detail, evidence, url,
    });
    const checks = [
      {
        ...check("Descriptive page title", Boolean(title), title || "No title tag found in the homepage HTML.", title),
      },
      {
        ...check("Meta description", Boolean(description), description || "No meta description found.", description),
      },
      {
        ...check("Restaurant structured data", hasRestaurantSchema, hasRestaurantSchema
          ? "Restaurant or CafeOrCoffeeShop JSON-LD found. Full schema validity was not checked."
          : "No Restaurant or CafeOrCoffeeShop JSON-LD found in the initial HTML."),
      },
      {
        ...check("Visible street address", hasAddress, hasAddress
          ? "1846 Garnet is present in homepage text."
          : "The supplied street address was not found in homepage text."),
      },
      {
        ...check("Discoverable menu link", hasMenuLink, hasMenuLink
          ? "A link with menu text or URL was found."
          : "No menu link found in homepage HTML."),
      },
      {
        ...check("Primary heading", h1.length === 1, `${h1.length} H1 headings found. A single descriptive H1 is recommended.`, h1.join(" · ")),
      },
      {
        ...check("Canonical URL", hasCanonical, hasCanonical
          ? "Canonical link tag found."
          : "No canonical link tag found.", canonicalUrl ?? undefined),
      },
      check("Opening hours", /hours|open.*(?:am|pm)|(?:am|pm).*open/i.test(text), "Opening-hours language was checked in visible homepage text."),
      check("Dietary options", /vegan|vegetarian|gluten[ -]?free/i.test(normalized), "Dietary-option language was checked in visible homepage text."),
      check("Happy hour", /happy hour/i.test(normalized), "Happy-hour language was checked in visible homepage text."),
      check("Catering", /catering/i.test(normalized), "Catering language was checked in visible homepage text."),
      check("Private events or group dining", /private event|group dining|private dining|events/i.test(normalized), "Private-event and group-dining language was checked in visible homepage text."),
    ];
    const audit: WebsiteAudit = {
      id: randomUUID(),
      restaurantId: restaurant.id,
      createdAt: new Date().toISOString(),
      url,
      title,
      description,
      h1,
      h2,
      canonicalUrl,
      internalLinks,
      menuPages,
      jsonLd,
      visibleText: text.slice(0, 20_000),
      aboutUrl,
      aboutContent: aboutContent?.slice(0, 20_000) ?? null,
      hasRestaurantSchema,
      hasMenuLink,
      hasAddress,
      hasCanonical,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      checks,
      source: "live",
    };
    const current = await repo.read();
    const completedIds = new Set(current.scans.filter((scan) => scan.status === "completed" || scan.status === "partial").map((scan) => scan.id));
    const recommendations: Recommendation[] = diagnoseVisibility(restaurant.id, current.results.filter((result) => completedIds.has(result.scanId)), audit);
    await repo.saveAudit(audit, recommendations);
    return audit;
  }
}
