export type Restaurant = {
  id: string;
  name: string;
  website: string;
  address: string;
  neighborhood: string;
  cuisine: string;
  opened: number;
  highlights: string[];
  provenance: "user-supplied";
};
export type SearchQuery = {
  id: string;
  restaurantId: string;
  text: string;
  intent: string;
  enabled: boolean;
  category?: string;
  active?: boolean;
};
export type Mention = {
  name: string;
  position: number | null;
  isTarget: boolean;
  evidence: string;
};
export type QueryResult = {
  id: string;
  restaurantId: string;
  scanId: string;
  queryId: string;
  query: string;
  status: "success" | "unverified" | "failed" | "cancelled";
  answer: string;
  rawResponse?: string;
  usage?: Record<string, unknown>;
  providerCreatedAt?: string;
  queryCategory?: string;
  parseVersion?: number;
  citations: string[];
  citationIds?: string[];
  mentions: Mention[];
  error?: string;
  model: string;
  createdAt: string;
};
export type ScanRun = {
  id: string;
  restaurantId: string;
  status: "running" | "completed" | "partial" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  queryCount: number;
  successCount: number;
  completedCount?: number;
  queries?: SearchQuery[];
  cancelRequested?: boolean;
  error?: string;
  source: "live";
  querySet: string;
};
export type Competitor = {
  name: string;
  mentions: number;
  shareOfVoice: number;
  averagePosition: number | null;
  isTarget: boolean;
};
export type WebsiteAudit = {
  id: string;
  restaurantId: string;
  createdAt: string;
  url: string;
  title: string;
  description: string;
  h1: string[];
  hasRestaurantSchema: boolean;
  hasMenuLink: boolean;
  hasAddress: boolean;
  hasCanonical: boolean;
  wordCount: number;
  checks: { label: string; passed: boolean; detail: string }[];
  source: "live";
};
export type Recommendation = {
  id: string;
  restaurantId: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  source: "setup" | "audit" | "scan";
  status: "open" | "done";
  evidence: string;
};
export type ContentDraft = {
  id: string;
  restaurantId: string;
  kind: "description" | "faq" | "schema";
  title: string;
  body: string;
  createdAt: string;
  source: "template";
  status: "draft";
};
export type Measurement = {
  scanId: string;
  createdAt: string;
  visibilityScore: number;
  mentionRate: number;
  averagePosition: number | null;
  shareOfVoice: number;
  successfulQueries: number;
  totalQueries: number;
  querySet: string;
};
export type Snapshot = {
  restaurant: Restaurant;
  queries: SearchQuery[];
  scans: ScanRun[];
  results: QueryResult[];
  audits: WebsiteAudit[];
  recommendations: Recommendation[];
  drafts: ContentDraft[];
  config: {
    persistence: "supabase" | "memory";
    sonar: boolean;
  };
};
export type Section =
  | "overview"
  | "discovery"
  | "competitors"
  | "recommendations"
  | "studio"
  | "measurement"
  | "settings";
