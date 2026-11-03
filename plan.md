# BLACKTOWER AI Chat — Implementation Plan

## Product and implementation

Deliver a focused, responsive internal-use AI chat application using the initialized React/Express/tRPC/Drizzle project. Preserve the supplied BLACKTOWER artwork and its metallic monochrome/electric-blue visual language. Manus OAuth remains the login provider. Authorization is separate from login: the server-side `BLACKTOWER_ALLOWED_EMAILS` list gates internal access, `BLACKTOWER_APP_OWNER_EMAIL` identifies the app owner, and an empty allowlist fails closed for non-owner accounts. Project visibility is a separate platform sharing setting and must remain private/team-only when the user chooses the internal audience.

Keep the managed MySQL database for Manus OAuth user identities. Store new BLACKTOWER chat conversations and messages in separate Supabase tables prefixed `btchat_`; do not write to or alter the user's existing Supabase tables. Preserve any existing managed-MySQL chat records without copying or deleting them unless the user explicitly requests a migration. Use the authenticated Supabase migration tool for additive schema changes. The website server accesses Supabase through the Data REST API using protected server-side settings; normalize the configured project URL to its HTTPS origin and verify it matches the user-confirmed project before use.

The confirmed Supabase project has existing schema objects including `chat_threads`, `chat_messages`, `chat_participants`, `chat_summaries`, `kr_conversations`, `kr_messages`, `knowledge_items`, `knowledge_spaces`, `nexus_memory`, and `kr_memories`. The schema also contains alternate, unlinked sources: `telegram_messages`, `chat_sessions`, `bot_chat_messages`, `bot_conversations`, `nexus_memories`, `memories`, and `memory_clusters`. Only OpenAPI/schema metadata has been inspected; no Supabase row content has been read or modified. There is no dedicated `projects` table; project entries are represented by `knowledge_items.item_type='project'` within knowledge spaces.

Build a bounded, read-only owner browser for these identified sources using a fixed server-side table/column whitelist and paginated lists. Lists return metadata only; content-bearing columns are fetched only for a selected record after the exact server-side owner check. Thread/conversation detail fetches only child messages belonging to that authorized parent and pages them separately. Existing tables remain untouched. Explicit Lee sharing stays limited to `chat_thread`, `kr_conversation`, `knowledge_item`, and app-owned `btchat_conversation` records; do not add share support for alternate/unlinked sources in this MVP. The owner check must protect every owner-data procedure.

The service-role key bypasses Supabase RLS. Keep it server-only, never bundle it into the browser, and perform application authorization before any privileged query. New app records are owner-scoped to the authenticated Manus email. Share existing or new records only through explicit owner-granted records stored in a separate `btchat_record_shares` table. A share requires a recipient who is already on the internal allowlist, a required owner-entered share reason, and an explicit per-record action. Do not infer sharing from message-body keyword matches. Non-owners see only records with an active grant to their exact signed-in email.

For the existing ChatGPT-like experience, stream assistant output from the managed Manus LLM API through an authenticated Express SSE endpoint, keeping project credentials server-side. Keep recent chat context and request sizes bounded and retain per-user throttling. Model-provider keys, model-selection controls, and unrelated integrations remain out of scope. Managed LLM calls can consume project credits independently of implementation work.

Supabase documentation used for this design: [Data REST API](https://supabase.com/docs/guides/api), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Securing your data](https://supabase.com/docs/guides/database/secure-data), and [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres). Supabase states that secret/service-role keys bypass RLS and belong only in secure backend components; the persistent-backend connection guidance distinguishes direct connections from session poolers and requires encrypted connections. This app uses the Supabase Data API for runtime operations and the connected Supabase migration tool for DDL, so no Postgres password is needed in the website runtime.

## Main project structure

- `client/src/pages/Home.tsx`: authenticated chat shell, responsive navigation, conversation workspace, access states, and owner/shared-data view.
- `client/src/components/SupabaseDataBrowser.tsx`: compact owner-only source selector, bounded record lists, on-demand details, and basic loading/error states.
- `client/src/index.css`, `client/src/App.tsx`: BLACKTOWER palette, typography, focus/interaction styling, and dark presentation.
- `client/public`: `/manus-routes.json` page manifest and app assets.
- `server/_core/access.ts`, `server/_core/trpc.ts`: exact-email internal, owner, and shared-record authorization.
- `server/routers.ts`: owner-only Supabase data procedures, limited explicit share grants, and chat procedures.
- `server/_core/index.ts`: authenticated and bounded SSE endpoint for managed LLM streaming and cancellation.
- `server/supabase.ts`, `server/supabaseStore.ts`: server-only Supabase REST client and parameterized read/write helpers.
- Supabase `public.btchat_conversations`, `public.btchat_messages`, and `public.btchat_record_shares`: app-owned tables created additively; no edits to existing user tables.
- `drizzle/schema.ts`, `drizzle/`: managed MySQL user/auth schema only; existing conversation data is preserved.

## Design direction

**Design Movement:** BLACKTOWER’s own cinematic, industrial sci-fi identity—presented as a calm productivity console rather than a decorative landing page.

**Core Principles:** high contrast; quiet surfaces; precise hierarchy; restrained blue used only for action and focus.

**Color Philosophy:** near-black and graphite surfaces carry the metallic logo; vivid electric blue signals BLACKTOWER identity, active navigation, and the send action without flooding the interface.

**Layout Paradigm:** persistent narrow conversation rail at left on desktop, with one spacious reading/composition column; on mobile the rail becomes a compact drawer.

**Signature Elements:** supplied BLACKTOWER mark; a thin electric-blue active indicator; restrained metallic dividers and compact status labels.

**Interaction Philosophy:** fast, keyboard-friendly chat; immediate feedback; do not hide loading, access, or failure states.

**Animation:** short fades and subtle blue focus transitions only; no ambient or attention-seeking motion. Respect reduced-motion preferences.

**Typography System:** system sans-serif for readable conversation text; compact semibold display labels; monospaced only for small technical/status details.

**Brand Essence:** a private AI workspace for BLACKTOWER’s internal team; focused, precise, capable.

**Brand Voice:** direct, composed, and useful. Example lines: “What are we working on?” and “Your workspace is ready.”

**Wordmark & Logo:** use the supplied logo artwork intact; pair its small mark with a clean BLACKTOWER text label where the full artwork would be too small to read.

**Signature Brand Color:** electric blue sampled by eye from the supplied lightning accent, used sparingly against obsidian.

## Delivery boundary

Implement and preview changes in the current Manus project. Do not publish it or make it publicly accessible without an explicit request. Do not fetch existing conversation bodies or expose records to the Lee account until the owner-only access path and explicit share boundary are implemented. Keep the existing Supabase tables read-only; do not migrate, update, or delete user data. The 250-credit figure is a budget constraint, not a guarantee that ongoing inference is free or fully capped by the UI.
