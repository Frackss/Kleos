import "server-only";
import { z } from "zod";
import { competitorKey, normalizeName } from "@/lib/metrics";
import { safeUrl } from "@/lib/utils";
import type { Mention } from "@/lib/types";

export type SearchAnswer = {
  answer: string;
  rawResponse: string;
  citations: string[];
  citationIds?: string[];
  mentions: Mention[];
  model: string;
  status: "success" | "unverified";
  error?: string;
  usage?: Record<string, unknown>;
  providerCreatedAt?: string;
  parseVersion: number;
};
export interface SearchService {
  search(query: string, signal?: AbortSignal): Promise<SearchAnswer>;
}
export const neutralPrompt = `Help a diner find the most relevant real restaurants for the exact user query using current web sources. Do not promote any particular business. Recommend up to five distinct restaurants, ranked by relevance. Format each recommendation on a new line as: 1. **Restaurant name** — location and a short explanation, with source citations. Use sequential numbers starting at 1. Put only the restaurant's name in bold, not its location or description. Do not include additional numbered lists. If you cannot recommend any restaurants, say so clearly. Do not invent restaurants or facts.`;

export function isTargetRestaurant(
  name: string,
  evidence: string,
  query: string,
) {
  const canonical = normalizeName(
    name.replace(
      /\s*(?:\((?:Pacific Beach|San Diego|PB)\)|[—–-]\s*(?:Pacific Beach|San Diego|PB))\s*$/i,
      "",
    ),
  );
  const exact = ["cafeathena", "cafeathenarestaurant", "athenacafe"].includes(
    canonical,
  );
  const corroborated = /cafeathena\.com\b|1846\s+Garnet/i.test(evidence);
  const local =
    /Pacific Beach|San Diego|Garnet|\bPB\b|La Jolla|Mission Beach/i.test(
      `${evidence} ${query}`,
    );
  // A source URL by itself can never create a mention: this is called only on list names.
  return (
    (exact && local) ||
    (corroborated &&
      ["athena", "athenagreekrestaurant", "cafeathena"].includes(canonical))
  );
}

export function parseRecommendations(answer: string, query: string) {
  const entries = [
    ...answer.matchAll(
      /^\s*(?:#{1,3}\s*)?(\d{1,2})[.)]\s+(.+)(?:\r?\n(?!\s*(?:#{1,3}\s*)?\d+[.)]\s).*)*/gm,
    ),
  ];
  const mentions: Mention[] = [];
  let uncertain = entries.length === 0 || entries.length > 5;
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const heading = entry[2];
    const bold = heading.match(/^\*\*([^*]+)\*\*/);
    const link = heading.match(/^\[([^\]]+)\]\(https?:\/\/[^)]+\)/);
    const plain = heading.match(/^([^—–:]+?)\s+(?:—|–| - )/);
    const name = (bold?.[1] ?? link?.[1] ?? plain?.[1] ?? "")
      .trim()
      .replace(/\[\d+\]/g, "")
      .trim();
    if (
      !name ||
      name.length > 120 ||
      /https?:|recommendations|options|restaurants in|no restaurants/i.test(
        name,
      )
    ) {
      uncertain = true;
      continue;
    }
    if (Number(entry[1]) !== index + 1) uncertain = true;
    const key = competitorKey(name);
    if (seen.has(key)) {
      uncertain = true;
      continue;
    }
    seen.add(key);
    mentions.push({
      name,
      position: index + 1,
      evidence: entry[0].trim(),
      isTarget: isTargetRestaurant(name, entry[0], query),
    });
  }
  // Zero recommendations and malformed lists are deliberately not a measured absence.
  if (uncertain)
    return {
      mentions: mentions.map((m) => ({ ...m, position: null })),
      status: "unverified" as const,
      error:
        "The recommendation list could not be confidently parsed. Excluded from metrics; review the original answer.",
    };
  return { mentions, status: "success" as const };
}
const source = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  url: z.string(),
});
const envelope = z.object({
  model: z.string().nullish(),
  created_at: z.number().optional(),
  status: z.string(),
  usage: z.record(z.string(), z.unknown()).nullish(),
  output: z.array(
    z
      .object({
        type: z.string(),
        role: z.string().optional(),
        status: z.string().optional(),
        content: z
          .array(
            z.object({
              type: z.string(),
              text: z.string().optional(),
              annotations: z
                .array(
                  z.object({ type: z.string(), url: z.string().optional() }),
                )
                .optional(),
            }),
          )
          .optional(),
        results: z.array(source).optional(),
      })
      .passthrough(),
  ),
});
export function searchConfiguration() {
  const model = process.env.PERPLEXITY_MODEL?.trim();
  const legacy: Record<string, string> = {
    sonar: "fast",
    "sonar-pro": "fast",
    "sonar-reasoning-pro": "low",
    "sonar-deep-research": "high",
  };
  if (model && !legacy[model]) return { model };
  return { effort: model ? legacy[model] : "fast" };
}
export function searchModelLabel() {
  const config = searchConfiguration();
  return config.model ?? `agent/effort:${config.effort}`;
}
export class SearchProviderError extends Error {
  constructor(
    message: string,
    public rawResponse: string,
  ) {
    super(message);
  }
}
export class AgentSearchService implements SearchService {
  async search(query: string, signal?: AbortSignal): Promise<SearchAnswer> {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key)
      throw new Error(
        "Live search is not connected. Add PERPLEXITY_API_KEY and restart.",
      );
    const configuration = searchConfiguration();
    const model = searchModelLabel();
    const deadline = AbortSignal.timeout(75_000);
    const requestSignal = signal
      ? AbortSignal.any([signal, deadline])
      : deadline;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      requestSignal.throwIfAborted();
      response = await fetch("https://api.perplexity.ai/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: requestSignal,
        cache: "no-store",
        body: JSON.stringify({
          ...configuration,
          instructions:
            neutralPrompt +
            " Use web search before answering. Cite search result IDs in square brackets, like [1], for supported claims. Do not invent source IDs.",
          input: query,
          tools: [{ type: "web_search" }],
          max_output_tokens: 2200,
        }),
      });
      if (
        response.ok ||
        !(response.status === 429 || response.status >= 500) ||
        attempt === 2
      )
        break;
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("Search cancelled or timed out."));
        };
        const timer = setTimeout(
          () => {
            requestSignal.removeEventListener("abort", onAbort);
            resolve();
          },
          Math.min(
            10_000,
            Math.max(
              1000 * 2 ** attempt + Math.random() * 250,
              Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
            ),
          ),
        );
        requestSignal.addEventListener("abort", onAbort, { once: true });
        if (requestSignal.aborted) onAbort();
      });
    }
    if (!response?.ok) {
      const body = ((await response?.text()) ?? "")
        .split(key)
        .join("[REDACTED]");
      let providerType = "";
      try {
        providerType = JSON.parse(body)?.error?.type ?? "";
      } catch {}
      const message =
        providerType === "chat_completions_not_available"
          ? "Perplexity has disabled Sonar Chat Completions for this account (HTTP 403). The provider requires migration to /v1/responses; this is not a restaurant absence or an invalid-key finding."
          : response?.status === 401
            ? "Perplexity rejected authentication (HTTP 401). Check your API key."
            : response?.status === 403
              ? "Perplexity denied API access (HTTP 403). Check account permissions and provider availability."
              : `Perplexity request failed (${response?.status ?? "network"}) after retries. This query was not measured.`;
      throw new SearchProviderError(message, body);
    }
    const rawResponse = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(rawResponse);
    } catch {
      json = null;
    }
    const parsed = envelope.safeParse(json);
    if (!parsed.success)
      return {
        answer: "",
        rawResponse,
        mentions: [],
        citations: [],
        model,
        status: "unverified",
        error: "Unexpected provider response schema; excluded from metrics.",
        parseVersion: 2,
      };
    const raw = parsed.data;
    const messages = raw.output.filter(
      (item) => item.type === "message" && item.role === "assistant",
    );
    const answer = messages
      .flatMap((item) =>
        (item.content ?? [])
          .filter((part) => part.type === "output_text")
          .map((part) => part.text ?? ""),
      )
      .join("\n");
    const sources = raw.output
      .filter((item) => item.type === "search_results")
      .flatMap((item) => item.results ?? [])
      .flatMap((item) => {
        const url = safeUrl(item.url);
        return url ? [{ url, id: String(item.id ?? "source") }] : [];
      });
    // Keep original source IDs: Agent citations need not be sequential or start at one.
    const uniqueSources = [
      ...new Map(
        sources.map((item) => [`${item.id}:${item.url}`, item]),
      ).values(),
    ];
    const citedIds = new Set(
      [...answer.matchAll(/\[(?:web:)?(\d+)\]/g)].map((match) => match[1]),
    );
    const citedSources = uniqueSources.filter((source) =>
      citedIds.has(source.id),
    );
    const extracted =
      raw.status !== "completed" ||
      messages.some((item) => item.status && item.status !== "completed")
        ? {
            mentions: [],
            status: "unverified" as const,
            error:
              "The provider response was incomplete or truncated; excluded from metrics.",
          }
        : !citedSources.length
          ? {
              mentions: [],
              status: "unverified" as const,
              error:
                "No resolvable web citations were returned; search grounding could not be verified. Excluded from metrics.",
            }
          : parseRecommendations(answer, query);
    return {
      ...extracted,
      answer,
      rawResponse,
      citations: citedSources.map((item) => item.url),
      citationIds: citedSources.map((item) => item.id),
      model: raw.model ?? model,
      usage: raw.usage ?? undefined,
      providerCreatedAt: raw.created_at
        ? new Date(raw.created_at * 1000).toISOString()
        : undefined,
      parseVersion: 2,
    };
  }
}
