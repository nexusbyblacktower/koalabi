# BLACKTOWER AI Chat — Implementation Plan

## Product and implementation

Deliver a focused, responsive internal-use AI chat application using the initialized React/Express/tRPC/Drizzle project and its managed MySQL database. Preserve the supplied BLACKTOWER artwork and its metallic monochrome/electric-blue visual language. Manus OAuth is the default login because no alternate identity provider was named. Authorization is separate from login: the project owner/admin is allowed, and other users must match an exact email in a server-side `BLACKTOWER_ALLOWED_EMAILS` allowlist. An empty allowlist fails closed for non-owner accounts. Project visibility is a separate platform sharing setting and must remain private/team-only when the user chooses the internal audience.

Use authenticated, owner-scoped conversation and message records in MySQL. Provide a conversation list, new chat, selection, and deletion; stream assistant output from the managed Manus LLM API through an authenticated Express SSE endpoint, keeping the project API key server-side. Keep chat context bounded to recent turns and a limited input/output size; add a per-user in-process request throttle. Model-provider keys, model selection controls, file uploads, and integrations are outside this first MVP because none were specified. Ongoing LLM calls use the project's managed AI service and can consume project credits independently of implementation work.

## Main project structure

- `client/src/pages/Home.tsx`: authenticated shell, responsive navigation, conversation workspace, empty/denied/error states, and chat interactions.
- `client/src/index.css`, `client/src/App.tsx`: BLACKTOWER palette, typography, focus/interaction styling, and default dark presentation.
- `client/public`: `/manus-routes.json` page manifest; the supplied logo is stored in project-managed storage.
- `server/_core/access.ts`: owner and explicit-email authorization shared by tRPC and the stream endpoint.
- `server/routers.ts`: authenticated, owner-scoped conversation CRUD and message-history procedures.
- `server/_core/index.ts`: authenticated and bounded SSE endpoint for managed LLM streaming and cancellation.
- `drizzle/schema.ts`, `drizzle/`: additive conversations/messages schema and migration.
- `server/db.ts`: ownership-safe conversation and message persistence helpers.

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

Implement and preview the MVP in the current Manus project. Do not publish it or make it publicly accessible without an explicit request. User-specific access depends on the allowlist and the platform sharing control; the allowlist values are not known yet and will not be invented. The 250-credit figure is a budget constraint, not a guarantee that ongoing inference is free or fully capped by the UI.
