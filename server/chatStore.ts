import { and, asc, desc, eq, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { chatMessages, conversations } from "../drizzle/schema";
import { getDb } from "./db";

export async function listConversations(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({
    id: conversations.id,
    title: conversations.title,
    createdAt: conversations.createdAt,
    updatedAt: conversations.updatedAt,
  }).from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);
}

export async function createConversation(userId: number, title = "New chat") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const id = randomUUID();
  await db.insert(conversations).values({ id, userId, title: title.trim().slice(0, 120) || "New chat" });
  const [created] = await db.select({
    id: conversations.id,
    title: conversations.title,
    createdAt: conversations.createdAt,
    updatedAt: conversations.updatedAt,
  }).from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1);
  if (!created) throw new Error("Conversation could not be created");
  return created;
}

export async function getConversation(userId: number, conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [conversation] = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return conversation ?? null;
}

export async function listMessages(userId: number, conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) return null;
  return db.select({
    id: chatMessages.id,
    role: chatMessages.role,
    content: chatMessages.content,
    createdAt: chatMessages.createdAt,
  }).from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, userId)))
    .orderBy(asc(chatMessages.id));
}

export async function appendMessage(
  userId: number,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) throw new Error("Conversation not found");
  await db.insert(chatMessages).values({ conversationId, userId, role, content });
  await db.update(conversations).set({ updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

export async function titleFromFirstPrompt(userId: number, conversationId: string, prompt: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const conversation = await getConversation(userId, conversationId);
  if (conversation?.title === "New chat") {
    const title = prompt.trim().replace(/\s+/g, " ").slice(0, 72) || "New chat";
    await db.update(conversations).set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  }
}

export async function removeAssistantRepliesAfter(userId: number, conversationId: string, messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(chatMessages).where(and(
    eq(chatMessages.userId, userId),
    eq(chatMessages.conversationId, conversationId),
    eq(chatMessages.role, "assistant"),
    gt(chatMessages.id, messageId),
  ));
}

export async function deleteConversation(userId: number, conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(conversations).where(and(
    eq(conversations.id, conversationId),
    eq(conversations.userId, userId),
  ));
}
