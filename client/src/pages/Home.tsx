import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const LOGO_URL = "/manus-storage/blacktower-logo_0989c491.png";
const MAX_PROMPT_CHARS = 6_000;
const MarkdownMessage = lazy(() => import("@/components/MarkdownMessage"));

type VisibleMessage = {
  id?: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date | string;
};

function shortDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "BT";
  return source.split(/[\s._-]+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "BT";
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "brand-lockup-compact" : ""}`}>
      <img src={LOGO_URL} alt="BLACKTOWER emblem" className="brand-image" />
      <div className="brand-word-stack">
        <span className="brand-word">BLACKTOWER</span>
        <span className="brand-caption">INTERNAL AI</span>
      </div>
    </div>
  );
}

export default function Home() {
  const auth = useAuth();
  const accessQuery = trpc.auth.access.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const allowed = Boolean(accessQuery.data?.allowed);
  const utils = trpc.useUtils();
  const conversationsQuery = trpc.conversations.list.useQuery(undefined, {
    enabled: allowed,
    retry: false,
  });
  const createConversation = trpc.conversations.create.useMutation();
  const deleteConversation = trpc.conversations.delete.useMutation();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [retryText, setRetryText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const generatingRef = useRef(false);
  const identityRef = useRef<string | null>(auth.user?.openId ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isGenerating]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startNewChat = useCallback(() => {
    loadSequence.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    generatingRef.current = false;
    activeIdRef.current = null;
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setStreamError("");
    setRetryText("");
    setIsGenerating(false);
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    const identity = auth.user?.openId ?? null;
    if (identityRef.current !== identity) startNewChat();
    identityRef.current = identity;
  }, [auth.user?.openId, startNewChat]);

  const openConversation = useCallback(async (conversationId: string) => {
    loadSequence.current += 1;
    const sequence = loadSequence.current;
    abortRef.current?.abort();
    abortRef.current = null;
    generatingRef.current = false;
    activeIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setMessages([]);
    setStreamError("");
    setRetryText("");
    setIsGenerating(false);
    setSidebarOpen(false);
    try {
      const loaded = await utils.conversations.messages.fetch({ conversationId });
      if (sequence === loadSequence.current && activeIdRef.current === conversationId) {
        setMessages((loaded ?? []) as VisibleMessage[]);
      }
    } catch {
      if (sequence === loadSequence.current) setStreamError("This conversation could not be loaded. Refresh and try again.");
    }
  }, [utils.conversations.messages]);

  const handleSend = useCallback(async (rawText: string, retry = false) => {
    const prompt = rawText.trim();
    if (!prompt || generatingRef.current || prompt.length > MAX_PROMPT_CHARS) return;

    generatingRef.current = true;
    setIsGenerating(true);
    setStreamError("");
    if (!retry) {
      setRetryText("");
      setMessages(previous => [
        ...previous,
        { role: "user", content: prompt, id: `user-${Date.now()}` },
        { role: "assistant", content: "", id: `assistant-${Date.now()}` },
      ]);
      setInput("");
    } else {
      setRetryText(prompt);
      setMessages(previous => {
        const next = [...previous];
        const last = next[next.length - 1];
        if (last?.role === "assistant") next[next.length - 1] = { ...last, content: "" };
        else next.push({ role: "assistant", content: "", id: `assistant-${Date.now()}` });
        return next;
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let conversationId = activeIdRef.current;

    try {
      if (!conversationId) {
        const created = await createConversation.mutateAsync({ title: "New chat" });
        conversationId = created.id;
        activeIdRef.current = conversationId;
        setActiveConversationId(conversationId);
      }

      const response = await fetch("/api/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ conversationId, prompt, retry }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The message could not be sent.");
      }
      if (!response.body) throw new Error("Streaming is not available in this browser.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consumeFrame = (frame: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) return;
        const payload = JSON.parse(dataLines.join("\n")) as { delta?: string; message?: string };
        if (eventName === "error") throw new Error(payload.message || "The AI response was interrupted.");
        if (payload.delta) {
          const delta = payload.delta;
          setMessages(previous => {
            const next = [...previous];
            const last = next[next.length - 1];
            if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + delta };
            else next.push({ role: "assistant", content: delta, id: `assistant-${Date.now()}` });
            return next;
          });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          consumeFrame(frame);
          boundary = buffer.indexOf("\n\n");
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consumeFrame(buffer);
      setRetryText("");
    } catch (error) {
      if (!controller.signal.aborted) {
        setStreamError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        setRetryText(prompt);
      }
    } finally {
      if (abortRef.current === controller) {
        generatingRef.current = false;
        abortRef.current = null;
        setIsGenerating(false);
      }
      void utils.conversations.list.invalidate();
      if (conversationId) void utils.conversations.messages.invalidate({ conversationId });
    }
  }, [createConversation, utils.conversations.list, utils.conversations.messages]);

  const stopGeneration = () => abortRef.current?.abort();

  const removeConversation = async (conversationId: string, title: string) => {
    if (!window.confirm(`Delete “${title}” and its saved messages? This cannot be undone.`)) return;
    try {
      await deleteConversation.mutateAsync({ conversationId });
      if (activeIdRef.current === conversationId) startNewChat();
      await utils.conversations.list.invalidate();
    } catch {
      setStreamError("The conversation could not be deleted. Please try again.");
    }
  };

  const copyMessage = async (message: VisibleMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id ?? message.content);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setStreamError("Clipboard access was blocked by the browser.");
    }
  };

  const login = () => {
    try {
      startLogin();
    } catch {
      setStreamError("BLACKTOWER sign-in is not configured for this project.");
    }
  };

  const userName = auth.user?.name?.trim().split(/\s+/)[0] || "there";
  const recentUserPrompt = [...messages].reverse().find(message => message.role === "user")?.content || retryText;

  if (auth.loading || (auth.user && accessQuery.isLoading)) {
    return <div className="auth-screen"><Loader2 className="size-5 animate-spin text-sky-400" /><span>Preparing your BLACKTOWER workspace…</span></div>;
  }

  if (!auth.isAuthenticated || !auth.user) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <BrandMark />
          <div className="auth-rule" />
          <p className="eyebrow">PRIVATE WORKSPACE</p>
          <h1>Your work. Your signal.</h1>
          <p className="auth-copy">Sign in with your approved BLACKTOWER account to open the internal AI workspace.</p>
          {streamError && <div className="error-banner" role="alert">{streamError}</div>}
          <button className="primary-action auth-action" onClick={login}>
            Sign in with Manus <span aria-hidden="true">↗</span>
          </button>
          <p className="auth-footnote"><ShieldCheck className="size-3.5" /> Access is restricted to approved internal users.</p>
        </section>
        <span className="auth-version">BLACKTOWER AI <span>·</span> INTERNAL</span>
      </main>
    );
  }

  if (accessQuery.isError) {
    return (
      <main className="auth-screen">
        <section className="auth-card access-card">
          <BrandMark />
          <div className="access-icon"><ShieldCheck className="size-5" /></div>
          <p className="eyebrow">SECURE WORKSPACE</p>
          <h1>Access check unavailable</h1>
          <p className="auth-copy">Your session is signed in, but BLACKTOWER could not verify workspace access. Try again before continuing.</p>
          <button className="primary-action auth-action" onClick={() => void accessQuery.refetch()}>Retry access check</button>
          <button className="text-action" onClick={() => void auth.logout()}>Sign out</button>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="auth-screen">
        <section className="auth-card access-card">
          <BrandMark />
          <div className="access-icon"><ShieldCheck className="size-5" /></div>
          <p className="eyebrow">ACCESS RESTRICTED</p>
          <h1>This workspace is internal.</h1>
          <p className="auth-copy">{accessQuery.data?.requiresAllowlist ? "The owner account is the only enabled account until an internal email allowlist is configured." : "This signed-in account is not on the BLACKTOWER access list."}</p>
          {auth.user.email && <p className="signed-in-as">Signed in as <strong>{auth.user.email}</strong></p>}
          <p className="auth-footnote"><ShieldCheck className="size-3.5" /> Ask the workspace administrator to approve your email.</p>
          <button className="text-action" onClick={() => void auth.logout()}>Sign out</button>
        </section>
      </main>
    );
  }

  const conversationItems = conversationsQuery.data ?? [];

  return (
    <main className="bt-app">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark compact />
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X className="size-4" /></button>
        </div>
        <button className="new-chat-button" onClick={startNewChat}>
          <Plus className="size-4" strokeWidth={2.2} /> <span>New chat</span> <kbd>⌘ K</kbd>
        </button>
        <div className="sidebar-section-title"><span>RECENT</span><span className="sidebar-count">{conversationItems.length}</span></div>
        <nav className="conversation-list" aria-label="Recent conversations">
          {conversationsQuery.isLoading ? (
            <div className="sidebar-loading"><Loader2 className="size-3.5 animate-spin" /> Loading chats…</div>
          ) : conversationItems.length === 0 ? (
            <p className="sidebar-empty">Your recent chats will appear here.</p>
          ) : conversationItems.map(conversation => (
            <div key={conversation.id} className={`conversation-row ${activeConversationId === conversation.id ? "conversation-active" : ""}`}>
              <button className="conversation-select" onClick={() => void openConversation(conversation.id)} title={conversation.title}>
                <MessageSquare className="conversation-icon size-3.5" />
                <span className="conversation-title">{conversation.title}</span>
              </button>
              <span className="conversation-date">{shortDate(conversation.updatedAt)}</span>
              <button className="conversation-delete" aria-label={`Delete ${conversation.title}`} title="Delete conversation" onClick={() => void removeConversation(conversation.id, conversation.title)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-row">
            <div className="account-avatar">{initials(auth.user.name, auth.user.email)}</div>
            <div className="account-info"><span className="account-name">{auth.user.name || "BLACKTOWER user"}</span><span className="account-email">{auth.user.email || "Internal account"}</span></div>
            <button className="icon-button account-logout" aria-label="Sign out" title="Sign out" onClick={() => void auth.logout()}><LogOut className="size-4" /></button>
          </div>
          <div className="sidebar-status"><span className="status-dot" /> INTERNAL WORKSPACE</div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu className="size-5" /></button>
          <div className="topbar-context"><span className="context-mark" /><span>BLACKTOWER <span className="context-divider">/</span> AI WORKSPACE</span></div>
          <div className="topbar-right"><span className="topbar-private"><ShieldCheck className="size-3.5" /> PRIVATE</span><button className="topbar-avatar" title={auth.user.email || "Account"}>{initials(auth.user.name, auth.user.email)}</button></div>
        </header>

        <div className="chat-panel">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <div className="welcome-state">
                <div className="welcome-mark-wrap"><img src={LOGO_URL} alt="" className="welcome-mark" /></div>
                <p className="eyebrow welcome-eyebrow">BLACKTOWER AI <span>·</span> INTERNAL</p>
                <h1>What are we working on, {userName}?</h1>
                <p className="welcome-copy">A focused workspace for thinking, drafting, and moving work forward.</p>
                <div className="prompt-grid">
                  {[
                    { label: "Plan a project", prompt: "Help me turn a rough project idea into a clear, prioritized plan." },
                    { label: "Draft something", prompt: "Help me draft a clear, concise internal update." },
                    { label: "Think it through", prompt: "Help me think through the risks and trade-offs of a decision." },
                  ].map(item => (
                    <button key={item.label} className="prompt-card" onClick={() => void handleSend(item.prompt)}>
                      <span>{item.label}</span><span className="prompt-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-stack">
                {messages.map((message, index) => {
                  const messageKey = message.id ?? `${message.role}-${index}`;
                  const isLatestAssistant = message.role === "assistant" && index === messages.length - 1;
                  return (
                    <article key={messageKey} className={`message-row ${message.role === "user" ? "message-row-user" : "message-row-assistant"}`}>
                      {message.role === "assistant" && <div className="assistant-avatar"><img src={LOGO_URL} alt="" /></div>}
                      <div className={`message-content ${message.role === "user" ? "user-message-content" : "assistant-message-content"}`}>
                        {message.role === "user" ? (
                          <div className="user-bubble">{message.content}</div>
                        ) : message.content ? (
                          <Suspense fallback={<span className="markdown-loading">Rendering response…</span>}>
                            <MarkdownMessage content={message.content} />
                          </Suspense>
                        ) : isGenerating ? (
                          <div className="typing-indicator" aria-label="BLACKTOWER AI is responding"><span /><span /><span /></div>
                        ) : null}
                        {isLatestAssistant && message.content && !isGenerating && (
                          <div className="message-actions">
                            <button className="message-action" onClick={() => void copyMessage(message)}>{copiedId === messageKey || copiedId === message.content ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}<span>{copiedId === messageKey || copiedId === message.content ? "Copied" : "Copy"}</span></button>
                            <button className="message-action" onClick={() => recentUserPrompt && void handleSend(recentUserPrompt, true)}><RefreshCw className="size-3.5" /><span>Retry</span></button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="composer-wrap">
            {streamError && <div className="stream-error" role="alert"><span>{streamError}</span>{retryText && <button onClick={() => void handleSend(retryText, true)}>Retry <RefreshCw className="size-3.5" /></button>}</div>}
            <form className="composer" onSubmit={event => { event.preventDefault(); void handleSend(input); }}>
              <textarea
                value={input}
                onChange={event => setInput(event.target.value.slice(0, MAX_PROMPT_CHARS))}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend(input);
                  }
                }}
                placeholder="Message BLACKTOWER AI…"
                rows={1}
                maxLength={MAX_PROMPT_CHARS}
                aria-label="Message BLACKTOWER AI"
                disabled={isGenerating}
              />
              {isGenerating ? (
                <button className="send-button stop-button" type="button" onClick={stopGeneration} aria-label="Stop generation" title="Stop generation"><Square className="size-3.5" fill="currentColor" /></button>
              ) : (
                <button className="send-button" type="submit" disabled={!input.trim()} aria-label="Send message" title="Send message"><Send className="size-4" /></button>
              )}
            </form>
            <div className="composer-meta"><span>Enter to send <span className="meta-dot">·</span> Shift + Enter for a new line</span><span>{input.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}</span></div>
            <p className="credit-note"><Sparkles className="size-3" /> AI replies use project credits. Keep prompts focused; responses are capped for this workspace.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
