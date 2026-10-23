# Kleos

A restaurant AI search visibility MVP, built for Café Athena in Pacific Beach, San Diego. Next.js App Router, TypeScript, Tailwind CSS v4, locally owned shadcn/ui-style Button/Card components with Radix Slot, lucide-react, Recharts, Supabase PostgreSQL, Perplexity Agent API, and Cheerio.

## Run locally

Requires Node.js 20.9+ (tested with Node 24) and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. No credentials are needed to explore the full UI, manage setup actions, or create content templates. Without Supabase, changes are **temporary in-memory data in one server process**, not durable storage. An unconfigured live scan returns an actionable error and never fabricates results.

## Connect live services

1. Create a Supabase project and run `supabase/migrations/202610230001_locallens.sql` in its SQL Editor. It creates tables, indexes, seed profile/query data, RLS, and transactional RPC functions. Run this initial migration once, then apply `supabase/migrations/202610230002_discovery.sql` for the 30-query bank, incremental saves, and cancellation.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Use the server service-role key, never a public/anon key. Set both values together.
3. Set `PERPLEXITY_API_KEY` to a funded Perplexity API key. Optionally set `PERPLEXITY_MODEL` to a native Agent API model ID. Blank uses the `fast` effort preset with web search. Legacy Sonar model names map to the documented effort equivalents.
4. Restart the development server. Settings displays configuration status; a successful scan verifies the provider key.
5. Click **Run AI Visibility Scan**. The default is 12 queries; AI Discovery supports 5, 12, or 30. Two requests run concurrently, with a 75-second overall timeout per query and up to three attempts for 429/5xx responses (exponential backoff). Each completed result is saved immediately. Progress polls every two seconds; cancel aborts in-flight work and retains completed results. Expand AI Discovery results to inspect answers, citations, and extracted mentions.
6. Click **Analyze website** in Recommendations to fetch the real Café Athena homepage. Audit failures remain errors, not findings. Create and export template drafts in Content Studio.

### Provider compatibility

The app uses `https://api.perplexity.ai/v1/responses`, the documented Agent API alias. Requests use `input`, `instructions`, `max_output_tokens`, and a `web_search` tool. The default `fast` effort preset replaces legacy `sonar`; optional model IDs can be configured server-side. Responses use typed `output` items: assistant `output_text` for the original answer and `search_results` for sources. Only cited, safe source URLs are exposed as citation links, preserving their original IDs. All search results remain in the raw provider JSON. Incomplete, ungrounded, and uncertain results are unverified and excluded from metrics.

The configured account rejected the legacy Chat Completions endpoint. Migration to Agent API was explicitly approved and a single live query plus a five-query batch both succeeded (all six responses had parsed lists and web citations). Actual provider-returned model IDs are retained rather than labeling routed answers as Sonar. See [Perplexity's migration guide](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to) and [Agent API quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart). Live credentials are not included; install and build do not need them.

## Deploy on Vercel

Import this repository as a Next.js project. Set the same three server environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PERPLEXITY_API_KEY`). Redeploy after changes. The API uses the Node runtime and `maxDuration = 300`; select a deployment plan/runtime supporting that duration. The scan worker runs through Next.js `after()`, with a 270-second application deadline. Use Supabase on Vercel; the process-local fallback is only for local development.

The demo opens directly without user sign-in, passwords, or session setup, including in production. Supabase is used solely as PostgreSQL and its backend data API; no Supabase Auth providers, users, or auth policies need configuration. The Next.js server accesses the database using the service-role key. Database RLS and service-role-only grants remain in place to prevent direct browser access. Mutation endpoints retain same-origin checks and input validation. Anyone who can access the demo can use its shared data and run scans.

## Pages and behavior

- **Overview**: template-inspired mention-rate hero, comparable-scan sparkline, observed competitors, navigable real-answer cards with mention highlights and citations, topic coverage, supporting KPIs, and an evidence-to-action table.
- **AI Discovery**: 30 editable queries in seven categories; 5/12/30-query scans, live progress/cancel, category filters, scan selector, formula tooltips with sample sizes, expandable original answers and raw JSON, citations, usage, and CSV export.
- **Competitors**: deduplicated restaurant mentions and share of voice from the latest measured scan. No competitor names are seeded.
- **Recommendations**: setup guidance, audit/scan-backed actions, completion toggles, evidence details, and homepage audit checks.
- **Content Studio**: saved description, FAQ, and JSON-LD **template drafts**, explicitly not AI-generated; copy/download for review. No automatic publishing.
- **Measurement**: real scan log, Recharts trend, CSV export, transparent metric definitions.
- **Settings**: supplied business profile, server configuration status, persistence disclosure, setup instructions.

Café Athena's address, cuisine, founding year, hours, dietary offerings, bar, and event services are **user-supplied, unverified information**. They are not presented as live audit findings. No fake historical scans or scores are created. A website audit only confirms signals present in fetched HTML, not the truth of the business claims.

## Architecture

- `src/app`: App Router pages, metadata, loading/error boundaries, and typed API dispatch.
- `src/components`: responsive shell, one component per dashboard page, shared states, shadcn-style UI primitives.
- `src/lib/types.ts`: Restaurant, SearchQuery, ScanRun, QueryResult, Mention, Competitor, WebsiteAudit, Recommendation, ContentDraft, Measurement.
- `src/lib/repositories/repository.ts`: repository contract, Supabase implementation, explicitly temporary memory implementation.
- `src/lib/services`: Agent API search, scan orchestration, Cheerio homepage audit, template content.
- `src/lib/metrics.ts`: pure, tested aggregations. Mentions live in query-result payloads; Competitor and Measurement are derived projections, avoiding stale duplicate data.
- `supabase/migrations`: JSONB entity payloads with relational IDs, foreign keys, indexed timestamps, RLS, and service-role-only transactions. No browser database access.

### Measurement rules

Only verified, successfully parsed recommendation lists count in denominators. Failed, unverified, and cancelled queries are visible and excluded. Legacy results produced by the previous extraction logic are marked unverified in the dashboard. Visibility = 100 × mean reciprocal rank across successful queries; absent/unranked = 0. Mention rate counts target names in the numbered recommendation list only, never prose or source-URL-only mentions. Average position excludes absent/unranked results. Share of voice divides each restaurant's deduplicated mention count by all observed restaurant mentions. Overview shows Café Athena's share of voice. Its competitor bars show mention rate across successful answers. The mention-rate delta and sparkline use only complete scans with matching query sets; they do not attribute changes to completed actions. Results are model-generated recommendation order, not a universal rank or guaranteed causal outcome. Compare consistent query sets and coverage. Query-set hashes are exported with measurements.

### Boundaries and next steps

This is a single-restaurant pilot. Profile editing, multi-user roles, scheduled jobs, public onboarding, and AI-written content are intentionally not implemented. Query text, category, and active state are editable; IDs remain stable. Template content is functional without extra AI spend. POST `/api/scan` returns 202 and starts the worker with `after()`. GET `/api/dashboard` returns progress and reconciles interrupted scans after five minutes, retaining partial results. POST `/api/cancel` persists a cancellation flag for cross-instance workers; POST `/api/queries` validates edits. Scan query snapshots and hashes keep history tied to the original query texts. Supabase prevents concurrent scans with a partial unique index. Memory locking is process-local, so use Supabase on Vercel. The dashboard shows the latest 30 scans and up to 1,000 records per other entity; add pagination/retention before operating at scale.

The audit fetches only allowlisted HTTPS Café Athena hosts, validates redirects, limits the body to 2 MB, and times out at 20 seconds. It does not render JavaScript or crawl other pages. Names are extracted from numbered recommendation headings. Sequential visible order determines rank (maximum five); missing, duplicate, irregular or truncated lists are unverified. Names are accent-normalized and canonical aliases deduplicated; target matching uses exact aliases with local context or website/address corroboration. Ambiguous extractions should be reviewed in AI Discovery. Recommendations retain their evidence timestamp and manual completion state across subsequent audits.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Tests exercise score denominators, failed/unverified/cancelled exclusions, exact-name matching, source/prose-only exclusions, visible ranking, retries, raw-response retention, concurrency limits, incremental saves, cancellation, API validation and scan isolation. SQL migrations were additionally exercised using isolated PGlite PostgreSQL (not a hosted Supabase project). Test fixtures are not application sample results.

## Visual system

The dashboard adopts the supplied HTML template’s parchment, navy, and cobalt palette, Arvo wordmark and headings, Inter body text, pill buttons, 20px cards, and Greek-key dividers across all seven pages. Fonts are hosted locally under `public/fonts` with their OFL licenses. The existing navigation is retained; app branding, metadata, footer and exports use Kleos. Unsupported AI engines, publishing actions, and sample performance claims from the reference are not presented as functional data. Topic bars distinguish measured zero from no scan and no configured query.
