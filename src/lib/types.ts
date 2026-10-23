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
  queryBankVersion?: string;
  model?: string;
  baselineScanId?: string;
};
export type Competitor = {
  name: string;
  mentions: number;
  shareOfVoice: number;
  averagePosition: number | null;
  isTarget: boolean;
};
export type AuditCheck = {
  label: string;
  status: "present" | "missing" | "unknown";
  passed: boolean;
  detail: string;
  evidence?: string;
  url?: string;
};
export type WebsiteAudit = {
  id: string;
  restaurantId: string;
  createdAt: string;
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2?: string[];
  canonicalUrl?: string | null;
  internalLinks?: { text: string; url: string }[];
  menuPages?: string[];
  jsonLd?: string[];
  visibleText?: string;
  aboutUrl?: string | null;
  aboutContent?: string | null;
  hasRestaurantSchema: boolean;
  hasMenuLink: boolean;
  hasAddress: boolean;
  hasCanonical: boolean;
  wordCount: number;
  checks: AuditCheck[];
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
  evidenceUrls?: string[];
  mechanism?: string;
  confidence?: "high" | "medium" | "low";
  effort?: "small" | "medium" | "large";
  hypothesis?: boolean;
};
export type ContentDraft = {
  id: string;
  restaurantId: string;
  kind: "about" | "faq" | "schema" | "menu" | "landing" | "outreach" | "description";
  title: string;
  body: string;
  original?: string | null;
  originalUrl?: string | null;
  rationale?: string;
  visibilityGap?: string;
  recommendationId?: string;
  model?: string;
  publish?: {
    title: string;
    metaDescription: string;
    heroHeadline: string;
    faq: { question: string; answer: string }[];
    internalLinks: string[];
    jsonLd: string;
    html: string;
    publishingMethod?: "manual" | "connected";
    publishedUrl?: string;
    verification?: {
      status: "pending" | "passed" | "failed";
      checkedAt: string;
      httpStatus?: number;
      checks: { label: string; passed: boolean; detail: string }[];
    };
    baselineScanId?: string;
    followUpScanIds?: string[];
    queryId?: string;
  };
  sandbox?: {
    experimentId: string;
    customerQuery: string;
    originalProfile: string;
    improvedProfile: string;
    configuration: { model: string; repeats: number; order: ("original" | "improved")[] };
    status: "draft" | "running" | "completed" | "partial" | "failed";
    originalResults: { answer: string; citations: string[]; mentions: Mention[]; status: "success" | "unverified" | "failed"; createdAt: string; error?: string }[];
    improvedResults: { answer: string; citations: string[]; mentions: Mention[]; status: "success" | "unverified" | "failed"; createdAt: string; error?: string }[];
    createdAt: string;
    completedAt?: string;
  };
  history?: { at: string; action: "created" | "regenerated" | "edited" | "approved" | "exported" | "copied" | "pull_request" | "published" | "verified" | "visibility_rechecked"; detail?: string }[];
  createdAt: string;
  updatedAt?: string;
  source: "template" | "sonar";
  status: "draft" | "approved" | "published" | "verified" | "monitoring";
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
