export type SupabaseTable =
  | "btchat_conversations"
  | "btchat_messages"
  | "btchat_record_shares"
  | "chat_threads"
  | "chat_messages"
  | "chat_participants"
  | "chat_summaries"
  | "kr_conversations"
  | "kr_messages"
  | "knowledge_items"
  | "knowledge_spaces"
  | "knowledge_relations"
  | "nexus_memory"
  | "kr_memories"
  | "telegram_messages"
  | "chat_sessions"
  | "bot_chat_messages"
  | "bot_conversations"
  | "nexus_memories"
  | "memories"
  | "memory_clusters";

export type SupabaseMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type SupabaseParams = Record<string, string | number | undefined>;

const EXPECTED_PROJECT_REF = "ipsywhsxpxibzichdytb";
const ALLOWED_TABLES = new Set<SupabaseTable>([
  "btchat_conversations",
  "btchat_messages",
  "btchat_record_shares",
  "chat_threads",
  "chat_messages",
  "chat_participants",
  "chat_summaries",
  "kr_conversations",
  "kr_messages",
  "knowledge_items",
  "knowledge_spaces",
  "knowledge_relations",
  "nexus_memory",
  "kr_memories",
  "telegram_messages",
  "chat_sessions",
  "bot_chat_messages",
  "bot_conversations",
  "nexus_memories",
  "memories",
  "memory_clusters",
]);

function getSupabaseConfig() {
  const configuredUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuredUrl || !key) throw new Error("Supabase is not configured for this project.");

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("Supabase is not configured for this project.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error("Supabase configuration does not match the confirmed project.");
  }
  return { origin: url.origin, key };
}

export async function supabaseRequest<T>(
  table: SupabaseTable,
  method: SupabaseMethod,
  params: SupabaseParams = {},
  body?: unknown,
  prefer?: string,
): Promise<T> {
  if (!ALLOWED_TABLES.has(table)) throw new Error("Supabase table is not approved for this app.");
  if (method !== "GET" && !table.startsWith("btchat_")) {
    throw new Error("Existing Supabase data is read-only in this app.");
  }

  const { origin, key } = getSupabaseConfig();
  const url = new URL(`/rest/v1/${table}`, origin);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const headers: Record<string, string> = {
    apikey: key,
    accept: "application/json",
  };
  // New Supabase secret keys are accepted as apikeys; legacy JWT service_role keys
  // also need Authorization. Never send either credential to client code.
  if (!key.startsWith("sb_secret_")) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (prefer) headers.prefer = prefer;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("Supabase data service is temporarily unavailable.");
  }
  if (!response.ok) {
    // Do not forward upstream error bodies or record data to the browser.
    throw new Error(`Supabase data request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Supabase returned an invalid response.");
  }
}
