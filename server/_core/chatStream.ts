import type { Express, Request, Response } from "express";
import { appendMessage, getConversation, listMessages, removeAssistantRepliesAfter, titleFromFirstPrompt } from "../chatStore";
import { isInternalUser } from "./access";
import { ENV } from "./env";
import { sdk } from "./sdk";

const MAX_PROMPT_CHARS = 6_000;
const MAX_CONTEXT_MESSAGES = 24;
const MAX_CONTEXT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 700;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 12;
const requestsByUser = new Map<number, { startedAt: number; count: number }>();

function takeRateLimit(userId: number) {
  const now = Date.now();
  const current = requestsByUser.get(userId);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestsByUser.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function event(res: Response, data: unknown, name?: string) {
  if (res.writableEnded || res.destroyed) return;
  if (name) res.write(`event: ${name}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function safeDelta(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(part => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "").join("");
  }
  return "";
}

function buildContext(rows: Array<{ role: "user" | "assistant"; content: string }>) {
  const recent: typeof rows = [];
  let chars = 0;
  for (let i = rows.length - 1; i >= 0 && recent.length < MAX_CONTEXT_MESSAGES; i -= 1) {
    const row = rows[i];
    if (chars + row.content.length > MAX_CONTEXT_CHARS) break;
    recent.unshift(row);
    chars += row.content.length;
  }
  return recent;
}

export function registerChatStreamRoute(app: Express) {
  app.post("/api/chat/stream", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!isInternalUser(user)) {
      res.status(403).json({ error: "This account is not on the BLACKTOWER internal access list." });
      return;
    }

    const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : "";
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const retry = req.body?.retry === true;
    if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !prompt || prompt.length > MAX_PROMPT_CHARS) {
      res.status(400).json({ error: `A conversation and a message of 1–${MAX_PROMPT_CHARS} characters are required.` });
      return;
    }
    if (!takeRateLimit(user.id)) {
      res.status(429).json({ error: "Request limit reached. Please wait a minute and try again." });
      return;
    }
    if (!ENV.forgeApiUrl.trim() || !ENV.forgeApiKey) {
      res.status(503).json({ error: "The managed AI service is not configured for this project." });
      return;
    }

    try {
      const conversation = await getConversation(user.id, conversationId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
      let stored = await listMessages(user.id, conversationId);
      if (!stored) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }

      const lastUser = [...stored].reverse().find(message => message.role === "user");
      if (retry && lastUser && lastUser.content === prompt) {
        await removeAssistantRepliesAfter(user.id, conversationId, lastUser.id);
        stored = (await listMessages(user.id, conversationId)) ?? [];
      } else {
        await appendMessage(user.id, conversationId, "user", prompt);
        await titleFromFirstPrompt(user.id, conversationId, prompt);
        stored = (await listMessages(user.id, conversationId)) ?? [];
      }

      const history = buildContext(stored);
      const controller = new AbortController();
      let finished = false;
      let answer = "";
      res.on("close", () => {
        if (!finished && !res.writableEnded) controller.abort();
      });

      res.status(200);
      res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      try {
        const upstream = await fetch(`${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ENV.forgeApiKey}`,
          },
          body: JSON.stringify({
            stream: true,
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [
              { role: "system", content: "You are BLACKTOWER AI, a clear, capable assistant for an internal team. Be accurate, practical, and concise. Do not claim access to private company data unless it is provided in the conversation." },
              ...history.map(message => ({ role: message.role, content: message.content })),
            ],
          }),
          signal: controller.signal,
        });

        if (!upstream.ok || !upstream.body) {
          const details = await upstream.text().catch(() => "");
          console.warn(`[Chat] Managed AI request failed (${upstream.status}); response omitted from client.`);
          event(res, { message: upstream.status === 429 ? "The AI service is busy or the project usage limit was reached. Try again shortly." : "The AI service could not complete this request. Try again." }, "error");
          if (details) console.warn(`[Chat] Upstream response length: ${details.length}`);
        } else {
          const decoder = new TextDecoder();
          let buffer = "";
          let done = false;
          const reader = upstream.body.getReader();
          while (true) {
            const { value: chunk, done: streamDone } = await reader.read();
            if (streamDone) break;
            if (chunk) buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              for (const line of frame.split(/\r?\n/)) {
                if (!line.startsWith("data:")) continue;
                const raw = line.slice(5).trim();
                if (raw === "[DONE]") {
                  done = true;
                  break;
                }
                try {
                  const payload = JSON.parse(raw) as { error?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
                  if (payload.error) throw new Error("Upstream stream error");
                  const delta = safeDelta(payload.choices?.[0]?.delta?.content);
                  if (delta) {
                    answer += delta;
                    event(res, { delta });
                  }
                } catch (error) {
                  if (error instanceof SyntaxError) continue;
                  throw error;
                }
              }
              if (done) break;
              boundary = buffer.indexOf("\n\n");
            }
            if (done || controller.signal.aborted) break;
          }

          buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");

          if (answer.trim()) {
            await appendMessage(user.id, conversationId, "assistant", answer.slice(0, 40_000));
          }
          if (!controller.signal.aborted && !answer.trim()) {
            event(res, { message: "The AI returned an empty response. Please retry." }, "error");
          }
        }
      } catch (error) {
        if (answer.trim()) {
          await appendMessage(user.id, conversationId, "assistant", answer.slice(0, 40_000)).catch(() => undefined);
        }
        if (!controller.signal.aborted) {
          console.error("[Chat] Stream failed:", error instanceof Error ? error.message : "unknown error");
          event(res, { message: "The response was interrupted. Your prompt is saved; retry to continue." }, "error");
        }
      } finally {
        finished = true;
        if (!res.writableEnded && !res.destroyed) res.end();
      }
    } catch (error) {
      console.error("[Chat] Request failed:", error instanceof Error ? error.message : "unknown error");
      if (!res.headersSent) res.status(500).json({ error: "Chat could not be saved. Please try again." });
      else if (!res.writableEnded && !res.destroyed) {
        event(res, { message: "Chat could not be saved. Please try again." }, "error");
        res.end();
      }
    }
  });
}
