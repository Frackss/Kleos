import "server-only";
import { randomUUID } from "node:crypto";
import type { ContentDraft, Restaurant } from "@/lib/types";
import { getRepository } from "@/lib/repositories/repository";
export interface ContentService {
  create(kind: ContentDraft["kind"]): Promise<ContentDraft>;
}
function draftBody(kind: ContentDraft["kind"], r: Restaurant): string {
  if (kind === "schema")
    return JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: r.name,
        url: r.website,
        servesCuisine: ["Greek", "Mediterranean"],
        address: {
          "@type": "PostalAddress",
          streetAddress: "1846 Garnet Ave",
          addressLocality: "San Diego",
          addressRegion: "CA",
          postalCode: "92109",
          addressCountry: "US",
        },
        foundingDate: String(r.opened),
        description: `Greek and Mediterranean dining in ${r.neighborhood}, San Diego.`,
      },
      null,
      2,
    );
  if (kind === "faq")
    return `Where is ${r.name}?\n${r.name} is at ${r.address}, in ${r.neighborhood}.\n\nWhat food does ${r.name} serve?\nGreek and Mediterranean cuisine, including tapas-style small plates.\n\nAre dietary options available?\nThe restaurant offers vegan, vegetarian, and gluten-free options. Ask the team about specific ingredients and preparation before ordering.\n\nDoes ${r.name} have happy hour?\nThe supplied restaurant profile lists daily happy hour from 3–6 PM. Confirm current hours and offers with the restaurant.\n\nCan I plan a group event?\nContact ${r.name} about catering, group dining, and private events.`;
  return `${r.name} brings Greek and Mediterranean dining to ${r.neighborhood}, San Diego. Established in ${r.opened}, the restaurant serves tapas-style small plates with vegan, vegetarian, and gluten-free options. Explore a full bar and mythology-themed cocktails, or gather for daily happy hour from 3–6 PM. Catering, group dining, and private events are also available. Find us at ${r.address}. Visit ${r.website} for current menus and details.`;
}
export class TemplateContentService implements ContentService {
  async create(kind: ContentDraft["kind"]) {
    const repo = getRepository();
    const { restaurant } = await repo.read();
    const draft: ContentDraft = {
      id: randomUUID(),
      restaurantId: restaurant.id,
      kind,
      title: {
        description: "Local restaurant description",
        faq: "Dining & discovery FAQs",
        schema: "Restaurant JSON-LD",
      }[kind],
      body: draftBody(kind, restaurant),
      createdAt: new Date().toISOString(),
      source: "template",
      status: "draft",
    };
    await repo.saveDraft(draft);
    return draft;
  }
}
