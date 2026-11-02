import { isInternalUser } from "./_core/access";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { internalProcedure, publicProcedure, router } from "./_core/trpc";
import { createConversation, deleteConversation, listConversations, listMessages } from "./chatStore";
import { z } from "zod";

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
      requiresAllowlist: !(process.env.BLACKTOWER_ALLOWED_EMAILS ?? "").trim(),
      email: ctx.user?.email ?? null,
    })),
  }),
  conversations: router({
    list: internalProcedure.query(({ ctx }) => listConversations(ctx.user.id)),
    messages: internalProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .query(({ ctx, input }) => listMessages(ctx.user.id, input.conversationId)),
    create: internalProcedure
      .input(z.object({ title: z.string().trim().max(120).optional() }))
      .mutation(({ ctx, input }) => createConversation(ctx.user.id, input.title || "New chat")),
    delete: internalProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await deleteConversation(ctx.user.id, input.conversationId);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
