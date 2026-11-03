export const SUPABASE_BROWSE_SOURCES = [
  { id: "btchat_conversations", label: "BLACKTOWER chats", group: "BLACKTOWER app data" },
  { id: "chat_threads", label: "Chat threads", group: "Conversation history" },
  { id: "kr_conversations", label: "KR conversations", group: "Conversation history" },
  { id: "telegram_messages", label: "Telegram messages", group: "Alternate history" },
  { id: "chat_sessions", label: "Chat sessions", group: "Alternate history" },
  { id: "bot_chat_messages", label: "Bot chat messages", group: "Alternate history" },
  { id: "bot_conversations", label: "Bot conversations", group: "Alternate history" },
  { id: "knowledge_items", label: "Topics and projects", group: "Topics and projects" },
  { id: "knowledge_spaces", label: "Knowledge spaces", group: "Topics and projects" },
  { id: "knowledge_relations", label: "Topic relationships", group: "Topics and projects" },
  { id: "nexus_memory", label: "Nexus memory", group: "Memory" },
  { id: "kr_memories", label: "KR memories", group: "Memory" },
  { id: "nexus_memories", label: "Nexus memories (alternate)", group: "Memory" },
  { id: "memories", label: "Memories (alternate)", group: "Memory" },
  { id: "memory_clusters", label: "Memory clusters", group: "Memory" },
] as const;

export type SupabaseBrowseSource = (typeof SUPABASE_BROWSE_SOURCES)[number]["id"];

export const SHAREABLE_BROWSE_SOURCES = [
  "btchat_conversations",
  "chat_threads",
  "kr_conversations",
  "knowledge_items",
] as const satisfies readonly SupabaseBrowseSource[];

export type ShareableBrowseSource = (typeof SHAREABLE_BROWSE_SOURCES)[number];

export const SHAREABLE_RECORD_TYPES = [
  "btchat_conversation",
  "chat_thread",
  "kr_conversation",
  "knowledge_item",
] as const;

export type ShareableRecordType = (typeof SHAREABLE_RECORD_TYPES)[number];

export const SHARE_TYPE_TO_SOURCE: Record<ShareableRecordType, ShareableBrowseSource> = {
  btchat_conversation: "btchat_conversations",
  chat_thread: "chat_threads",
  kr_conversation: "kr_conversations",
  knowledge_item: "knowledge_items",
};
