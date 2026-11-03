import {
  SHARE_TYPE_TO_SOURCE,
  type ShareableBrowseSource,
  type ShareableRecordType,
  type SupabaseBrowseSource,
} from "../shared/supabaseBrowser";
import { isAllowlistedEmail, normalizeEmail } from "./_core/access";
import { supabaseRequest, type SupabaseTable } from "./supabase";

type Row = Record<string, unknown>;
type SourceConfig = {
  table: SupabaseTable;
  listSelect: string;
  detailSelect: string;
  order: string;
  shareType?: ShareableRecordType;
};

const SOURCE_CONFIG: Record<SupabaseBrowseSource, SourceConfig> = {
  btchat_conversations: {
    table: "btchat_conversations",
    listSelect: "id,owner_email,title,created_at,updated_at",
    detailSelect: "id,owner_email,title,created_at,updated_at",
    order: "updated_at.desc",
    shareType: "btchat_conversation",
  },
  chat_threads: {
    table: "chat_threads",
    listSelect: "id,title,platform,created_by,archived,created_at,updated_at",
    detailSelect: "id,title,platform,external_thread_id,created_by,archived,created_at,updated_at",
    order: "updated_at.desc",
    shareType: "chat_thread",
  },
  kr_conversations: {
    table: "kr_conversations",
    listSelect: "id,display_name,telegram_username,relationship_state,current_mode,created_at,updated_at",
    detailSelect: "id,display_name,telegram_username,relationship_state,current_mode,created_at,updated_at",
    order: "updated_at.desc",
    shareType: "kr_conversation",
  },
  telegram_messages: {
    table: "telegram_messages",
    listSelect: "id,telegram_chat_id,telegram_sender_id,sender_name,sender_username,chat_title,is_private,is_group,is_channel,is_outgoing,sent_at,received_at,created_at",
    detailSelect: "id,telegram_chat_id,telegram_message_id,telegram_sender_id,sender_name,sender_username,chat_title,is_private,is_group,is_channel,is_outgoing,text_content,sent_at,received_at,reply_to_message_id,created_at",
    order: "sent_at.desc.nullslast",
  },
  chat_sessions: {
    table: "chat_sessions",
    listSelect: "id,telegram_chat_id,username,display_name,first_seen_at,last_seen_at",
    detailSelect: "id,telegram_chat_id,username,display_name,first_seen_at,last_seen_at",
    order: "last_seen_at.desc.nullslast",
  },
  bot_chat_messages: {
    table: "bot_chat_messages",
    listSelect: "id,telegram_chat_id,telegram_message_id,direction,message_type,created_at",
    detailSelect: "id,telegram_chat_id,telegram_message_id,direction,message_type,text,created_at",
    order: "created_at.desc",
  },
  bot_conversations: {
    table: "bot_conversations",
    listSelect: "id,telegram_user_id,role,tokens,created_at",
    detailSelect: "id,telegram_user_id,role,content,tokens,created_at",
    order: "created_at.desc",
  },
  knowledge_items: {
    table: "knowledge_items",
    listSelect: "id,space_id,item_type,title,source_type,tags,status,access_level,created_at,updated_at",
    detailSelect: "id,space_id,item_type,title,content,source_type,source_ref,tags,status,importance_score,owner_id,access_level,created_at,updated_at",
    order: "updated_at.desc",
    shareType: "knowledge_item",
  },
  knowledge_spaces: {
    table: "knowledge_spaces",
    listSelect: "id,slug,name,owner_id,created_at,updated_at",
    detailSelect: "id,slug,name,description,owner_id,created_at,updated_at",
    order: "updated_at.desc",
  },
  knowledge_relations: {
    table: "knowledge_relations",
    listSelect: "id,from_item_id,relation_type,to_item_id,weight,created_at",
    detailSelect: "id,from_item_id,relation_type,to_item_id,weight,metadata,created_at",
    order: "created_at.desc",
  },
  nexus_memory: {
    table: "nexus_memory",
    listSelect: "id,title,category,kind,evidence_level,memory_scope,is_retrievable,created_at,updated_at",
    detailSelect: "id,entry_id,title,category,content,kind,evidence_level,created_at,updated_at,source_thread_id,source_message_id,memory_scope,is_retrievable,knowledge_item_id,space_id",
    order: "updated_at.desc",
  },
  kr_memories: {
    table: "kr_memories",
    listSelect: "id,conversation_id,memory_layer,subject,source_type,confidence,verification_status,is_active,recorded_at",
    detailSelect: "id,conversation_id,memory_layer,subject,statement,structured_value,source_type,source_reference,observed_at,recorded_at,confidence,verification_status,is_live_verified,is_active,expires_at,created_by",
    order: "recorded_at.desc",
  },
  nexus_memories: {
    table: "nexus_memories",
    listSelect: "id,memory_type,title,source,confidence,importance,created_at,updated_at",
    detailSelect: "id,memory_type,title,content,source,confidence,importance,created_at,updated_at",
    order: "updated_at.desc",
  },
  memories: {
    table: "memories",
    listSelect: "id,user_id,category,created_at",
    detailSelect: "id,user_id,content,category,created_at",
    order: "created_at.desc",
  },
  memory_clusters: {
    table: "memory_clusters",
    listSelect: "id,cluster_name,importance_score,created_at",
    detailSelect: "id,cluster_name,summary,importance_score,created_at",
    order: "created_at.desc",
  },
};

const MAX_PAGE_SIZE = 50;
const MAX_OFFSET = 100_000;
const APP_MESSAGE_HISTORY_LIMIT = 500;

function boundedPage(limit: number, offset: number) {
  return {
    limit: Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(limit) || 25)),
    offset: Math.max(0, Math.min(MAX_OFFSET, Math.trunc(offset) || 0)),
  };
}

function requiredEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email) throw new Error("A verified email address is required.");
  return email;
}

function mapAppConversation(row: Row) {
  return {
    id: String(row.id),
    title: String(row.title ?? "New chat"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listConversations(ownerEmail: string) {
  const email = requiredEmail(ownerEmail);
  const rows = await supabaseRequest<Row[]>("btchat_conversations", "GET", {
    select: "id,title,created_at,updated_at",
    owner_email: `eq.${email}`,
    order: "updated_at.desc",
    limit: 100,
  });
  return rows.map(mapAppConversation);
}

export async function createConversation(ownerEmail: string, title = "New chat") {
  const email = requiredEmail(ownerEmail);
  const rows = await supabaseRequest<Row[]>("btchat_conversations", "POST", {
    select: "id,title,created_at,updated_at",
  }, {
    owner_email: email,
    title: title.trim().slice(0, 120) || "New chat",
  }, "return=representation");
  if (!rows[0]) throw new Error("Conversation could not be created.");
  return mapAppConversation(rows[0]);
}

export async function getConversation(ownerEmail: string, conversationId: string) {
  const email = requiredEmail(ownerEmail);
  const rows = await supabaseRequest<Row[]>("btchat_conversations", "GET", {
    select: "id,owner_email,title,created_at,updated_at",
    id: `eq.${conversationId}`,
    owner_email: `eq.${email}`,
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function listMessages(ownerEmail: string, conversationId: string) {
  const email = requiredEmail(ownerEmail);
  const conversation = await getConversation(email, conversationId);
  if (!conversation) return null;
  const rows = await supabaseRequest<Row[]>("btchat_messages", "GET", {
    select: "id,sequence,role,content,created_at",
    conversation_id: `eq.${conversationId}`,
    order: "sequence.asc",
    limit: APP_MESSAGE_HISTORY_LIMIT,
  });
  return rows.map(row => ({
    id: String(row.id),
    role: row.role as "user" | "assistant",
    content: String(row.content ?? ""),
    createdAt: String(row.created_at),
  }));
}

export async function appendMessage(
  ownerEmail: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
) {
  const email = requiredEmail(ownerEmail);
  const conversation = await getConversation(email, conversationId);
  if (!conversation) throw new Error("Conversation not found.");
  await supabaseRequest<Row[]>("btchat_messages", "POST", { select: "id" }, {
    conversation_id: conversationId,
    role,
    content: content.slice(0, 40_000),
  }, "return=representation");
  await supabaseRequest<Row[]>("btchat_conversations", "PATCH", {
    id: `eq.${conversationId}`,
    owner_email: `eq.${email}`,
    select: "id",
  }, { updated_at: new Date().toISOString() }, "return=representation");
}

export async function titleFromFirstPrompt(ownerEmail: string, conversationId: string, prompt: string) {
  const email = requiredEmail(ownerEmail);
  const conversation = await getConversation(email, conversationId);
  if (conversation?.title === "New chat") {
    const title = prompt.trim().replace(/\s+/g, " ").slice(0, 72) || "New chat";
    await supabaseRequest<Row[]>("btchat_conversations", "PATCH", {
      id: `eq.${conversationId}`,
      owner_email: `eq.${email}`,
      select: "id",
    }, { title, updated_at: new Date().toISOString() }, "return=representation");
  }
}

export async function removeAssistantRepliesAfter(ownerEmail: string, conversationId: string, messageId: string) {
  const email = requiredEmail(ownerEmail);
  const conversation = await getConversation(email, conversationId);
  if (!conversation) throw new Error("Conversation not found.");
  const rows = await supabaseRequest<Row[]>("btchat_messages", "GET", {
    select: "id,sequence,role",
    id: `eq.${messageId}`,
    conversation_id: `eq.${conversationId}`,
    role: "eq.user",
    limit: 1,
  });
  const userMessage = rows[0];
  if (!userMessage) return;
  await supabaseRequest<void>("btchat_messages", "DELETE", {
    conversation_id: `eq.${conversationId}`,
    role: "eq.assistant",
    sequence: `gt.${userMessage.sequence}`,
  }, undefined, "return=minimal");
}

export async function deleteConversation(ownerEmail: string, conversationId: string) {
  const email = requiredEmail(ownerEmail);
  await supabaseRequest<void>("btchat_conversations", "DELETE", {
    id: `eq.${conversationId}`,
    owner_email: `eq.${email}`,
  });
}

export async function listOwnerSource(source: SupabaseBrowseSource, limit: number, offset: number) {
  const config = SOURCE_CONFIG[source];
  const page = boundedPage(limit, offset);
  const rows = await supabaseRequest<Row[]>(config.table, "GET", {
    select: config.listSelect,
    order: config.order,
    limit: page.limit,
    offset: page.offset,
  });
  return { rows, ...page, hasMore: rows.length === page.limit };
}

type RelatedSection = {
  key: string;
  label: string;
  rows: Row[];
  offset: number;
  limit: number;
  hasMore: boolean;
};

async function relatedRows(
  key: string,
  label: string,
  table: SupabaseTable,
  select: string,
  foreignKey: string,
  recordId: string,
  limit: number,
  offset: number,
  order: string,
): Promise<RelatedSection> {
  const page = boundedPage(limit, offset);
  const rows = await supabaseRequest<Row[]>(table, "GET", {
    select,
    [foreignKey]: `eq.${recordId}`,
    order,
    limit: page.limit,
    offset: page.offset,
  });
  return { key, label, rows, ...page, hasMore: rows.length === page.limit };
}

export async function getOwnerSourceRecord(
  source: SupabaseBrowseSource,
  recordId: string,
  childOffset = 0,
  childLimit = 50,
) {
  const config = SOURCE_CONFIG[source];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) throw new Error("Record id is invalid.");
  const rows = await supabaseRequest<Row[]>(config.table, "GET", {
    select: config.detailSelect,
    id: `eq.${recordId}`,
    limit: 1,
  });
  const record = rows[0];
  if (!record) throw new Error("Record not found.");

  const related: RelatedSection[] = [];
  if (source === "chat_threads") {
    related.push(await relatedRows("messages", "Messages", "chat_messages", "id,content,text,direction,message_type,is_edited,created_at,sent_at", "thread_id", recordId, childLimit, childOffset, "created_at.asc"));
    related.push(await relatedRows("participants", "Participants", "chat_participants", "id,display_name,role,is_active,created_at", "thread_id", recordId, 25, 0, "created_at.asc"));
    related.push(await relatedRows("summaries", "Summaries", "chat_summaries", "id,summary_type,summary_text,key_points,created_at", "thread_id", recordId, 10, 0, "created_at.desc"));
  } else if (source === "kr_conversations") {
    related.push(await relatedRows("messages", "Messages", "kr_messages", "id,direction,message_kind,body,delivery_status,created_at,sent_at", "conversation_id", recordId, childLimit, childOffset, "created_at.asc"));
  } else if (source === "knowledge_spaces") {
    related.push(await relatedRows("items", "Items in this space", "knowledge_items", "id,item_type,title,source_type,tags,status,created_at,updated_at", "space_id", recordId, childLimit, childOffset, "updated_at.desc"));
  } else if (source === "knowledge_items") {
    const page = boundedPage(25, 0);
    const relations = await supabaseRequest<Row[]>("knowledge_relations", "GET", {
      select: "id,from_item_id,relation_type,to_item_id,weight,created_at",
      or: `(from_item_id.eq.${recordId},to_item_id.eq.${recordId})`,
      order: "created_at.desc",
      limit: page.limit,
      offset: page.offset,
    });
    related.push({ key: "relations", label: "Related items", rows: relations, ...page, hasMore: relations.length === page.limit });
  } else if (source === "btchat_conversations") {
    related.push(await relatedRows("messages", "Messages", "btchat_messages", "id,sequence,role,content,created_at", "conversation_id", recordId, childLimit, childOffset, "sequence.asc"));
  }

  return { source, record, related };
}

function shareTypeForSource(source: SupabaseBrowseSource): ShareableRecordType | null {
  return SOURCE_CONFIG[source].shareType ?? null;
}

export async function listSharesForRecord(source: ShareableBrowseSource, recordId: string) {
  const recordType = shareTypeForSource(source);
  if (!recordType) return [];
  return supabaseRequest<Row[]>("btchat_record_shares", "GET", {
    select: "id,record_type,record_id,recipient_email,granted_by_email,share_reason,granted_at",
    record_type: `eq.${recordType}`,
    record_id: `eq.${recordId}`,
    revoked_at: "is.null",
    order: "granted_at.desc",
    limit: 50,
  });
}

export async function listSharesForUser(userEmail: string, limit: number, offset: number) {
  const email = requiredEmail(userEmail);
  const page = boundedPage(limit, offset);
  const rows = await supabaseRequest<Row[]>("btchat_record_shares", "GET", {
    select: "id,record_type,record_id,share_reason,granted_at",
    recipient_email: `eq.${email}`,
    revoked_at: "is.null",
    order: "granted_at.desc",
    limit: page.limit,
    offset: page.offset,
  });
  return { rows, ...page, hasMore: rows.length === page.limit };
}

export async function getSharedSourceRecord(userEmail: string, shareId: string, childOffset = 0, childLimit = 50) {
  const email = requiredEmail(userEmail);
  const grants = await supabaseRequest<Row[]>("btchat_record_shares", "GET", {
    select: "id,record_type,record_id,share_reason,granted_at",
    id: `eq.${shareId}`,
    recipient_email: `eq.${email}`,
    revoked_at: "is.null",
    limit: 1,
  });
  const grant = grants[0];
  if (!grant) throw new Error("This record is not shared with your account.");
  const source = SHARE_TYPE_TO_SOURCE[grant.record_type as ShareableRecordType];
  if (!source) throw new Error("This record type is not available for sharing.");
  const detail = await getOwnerSourceRecord(source, String(grant.record_id), childOffset, childLimit);
  if (source === "btchat_conversations") delete detail.record.owner_email;
  return { ...detail, shareReason: String(grant.share_reason ?? ""), sharedAt: String(grant.granted_at) };
}

export async function grantRecordShare(
  ownerEmail: string,
  source: ShareableBrowseSource,
  recordId: string,
  recipientEmail: string,
  reason: string,
) {
  const grantor = requiredEmail(ownerEmail);
  const recipient = requiredEmail(recipientEmail);
  const recordType = shareTypeForSource(source);
  if (!recordType) throw new Error("This source cannot be shared in the current release.");
  if (!isAllowlistedEmail(recipient)) throw new Error("Recipient must be an approved BLACKTOWER internal account.");
  if (recipient === grantor) throw new Error("Choose a different internal recipient.");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) throw new Error("Record id is invalid.");
  const config = SOURCE_CONFIG[source];
  const exists = await supabaseRequest<Row[]>(config.table, "GET", {
    select: "id",
    id: `eq.${recordId}`,
    limit: 1,
  });
  if (!exists[0]) throw new Error("Record not found.");

  const rows = await supabaseRequest<Row[]>("btchat_record_shares", "POST", {
    on_conflict: "record_type,record_id,recipient_email",
    select: "id,record_type,record_id,recipient_email,share_reason,granted_at",
  }, {
    record_type: recordType,
    record_id: recordId,
    recipient_email: recipient,
    granted_by_email: grantor,
    share_reason: reason.trim().slice(0, 300),
    granted_at: new Date().toISOString(),
    revoked_at: null,
    revoked_by_email: null,
  }, "resolution=merge-duplicates,return=representation");
  if (!rows[0]) throw new Error("The share could not be saved.");
  return rows[0];
}

export async function revokeRecordShare(ownerEmail: string, shareId: string) {
  const actor = requiredEmail(ownerEmail);
  const rows = await supabaseRequest<Row[]>("btchat_record_shares", "PATCH", {
    id: `eq.${shareId}`,
    revoked_at: "is.null",
    select: "id",
  }, {
    revoked_at: new Date().toISOString(),
    revoked_by_email: actor,
  }, "return=representation");
  return Boolean(rows[0]);
}
