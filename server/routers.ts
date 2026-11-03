import { isAllowlistedEmail, isAppOwner, isInternalUser, normalizeEmail } from "./_core/access";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { internalProcedure, ownerProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
} from "./chatStore";
import {
  getOwnerSourceRecord,
  getSharedSourceRecord,
  grantRecordShare,
  listOwnerSource,
  listSharesForRecord,
  listSharesForUser,
  revokeRecordShare,
} from "./supabaseStore";
import { z } from "zod";

const browseSource = z.enum([
  "btchat_conversations",
  "chat_threads",
  "kr_conversations",
  "telegram_messages",
  "chat_sessions",
  "bot_chat_messages",
  "bot_conversations",
  "knowledge_items",
  "knowledge_spaces",
  "knowledge_relations",
  "nexus_memory",
  "kr_memories",
  "nexus_memories",
  "memories",
  "memory_clusters",
]);
const shareableSource = z.enum([
  "btchat_conversations",
  "chat_threads",
  "kr_conversations",
  "knowledge_items",
]);
const pageInput = z.object({
  limit: z.number().int().min(1).max(50).default(25),
  offset: z.number().int().min(0).max(100_000).default(0),
});

function userEmail(value: string | null | undefined) {
  const email = normalizeEmail(value);
  if (!email) throw new Error("A verified internal email address is required.");
  return email;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    access: publicProcedure.query(({ ctx }) => ({
      allowed: isInternalUser(ctx.user),
      isOwner: isAppOwner(ctx.user),
      requiresAllowlist: !(process.env.BLACKTOWER_ALLOWED_EMAILS ?? "").trim(),
      email: ctx.user?.email ?? null,
    })),
  }),
  conversations: router({
    list: internalProcedure.query(({ ctx }) => listConversations(userEmail(ctx.user.email))),
    messages: internalProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .query(({ ctx, input }) => listMessages(userEmail(ctx.user.email), input.conversationId)),
    create: internalProcedure
      .input(z.object({ title: z.string().trim().max(120).optional() }))
      .mutation(({ ctx, input }) => createConversation(userEmail(ctx.user.email), input.title || "New chat")),
    delete: internalProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await deleteConversation(userEmail(ctx.user.email), input.conversationId);
        return { success: true } as const;
      }),
  }),
  supabaseData: router({
    ownerList: ownerProcedure
      .input(z.object({ source: browseSource, ...pageInput.shape }))
      .query(({ input }) => listOwnerSource(input.source, input.limit, input.offset)),
    ownerRecord: ownerProcedure
      .input(z.object({
        source: browseSource,
        recordId: z.string().min(1).max(128),
        childLimit: z.number().int().min(1).max(50).default(50),
        childOffset: z.number().int().min(0).max(100_000).default(0),
      }))
      .query(({ input }) => getOwnerSourceRecord(input.source, input.recordId, input.childOffset, input.childLimit)),
    sharesForRecord: ownerProcedure
      .input(z.object({ source: shareableSource, recordId: z.string().min(1).max(128) }))
      .query(({ input }) => listSharesForRecord(input.source, input.recordId)),
    grantShare: ownerProcedure
      .input(z.object({
        source: shareableSource,
        recordId: z.string().min(1).max(128),
        recipientEmail: z.string().email().max(320),
        reason: z.string().trim().min(4).max(300),
      }))
      .mutation(({ ctx, input }) => {
        if (!isAllowlistedEmail(input.recipientEmail)) {
          throw new Error("Recipient must be an approved BLACKTOWER internal account.");
        }
        return grantRecordShare(userEmail(ctx.user.email), input.source, input.recordId, input.recipientEmail, input.reason);
      }),
    revokeShare: ownerProcedure
      .input(z.object({ shareId: z.string().uuid() }))
      .mutation(({ ctx, input }) => revokeRecordShare(userEmail(ctx.user.email), input.shareId)),
    sharedList: internalProcedure
      .input(pageInput)
      .query(({ ctx, input }) => listSharesForUser(userEmail(ctx.user.email), input.limit, input.offset)),
    sharedRecord: internalProcedure
      .input(z.object({
        shareId: z.string().uuid(),
        childLimit: z.number().int().min(1).max(50).default(50),
        childOffset: z.number().int().min(0).max(100_000).default(0),
      }))
      .query(({ ctx, input }) => getSharedSourceRecord(userEmail(ctx.user.email), input.shareId, input.childOffset, input.childLimit)),
  }),
});

export type AppRouter = typeof appRouter;
