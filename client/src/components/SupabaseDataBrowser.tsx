import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Database, Loader2, LockKeyhole, RefreshCw, Share2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  SHAREABLE_BROWSE_SOURCES,
  SUPABASE_BROWSE_SOURCES,
  type ShareableBrowseSource,
  type SupabaseBrowseSource,
} from "../../../shared/supabaseBrowser";

const LIST_PAGE_SIZE = 25;
const CHILD_PAGE_SIZE = 50;
type Row = Record<string, unknown>;

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return "[value unavailable]"; }
}

function recordTitle(row: Row, source: SupabaseBrowseSource) {
  const preferred = row.title ?? row.display_name ?? row.subject ?? row.cluster_name ?? row.name ?? row.sender_name ?? row.telegram_username;
  return typeof preferred === "string" && preferred.trim() ? preferred : `${source.replaceAll("_", " ")} · ${String(row.id ?? "record")}`;
}

function dateLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function isShareableSource(source: SupabaseBrowseSource): source is ShareableBrowseSource {
  return (SHAREABLE_BROWSE_SOURCES as readonly string[]).includes(source);
}

function itemBody(row: Row) {
  const value = row.content ?? row.text ?? row.text_content ?? row.body ?? row.statement ?? row.summary ?? row.summary_text;
  return typeof value === "string" ? value : value === undefined ? "" : stringValue(value);
}

export default function SupabaseDataBrowser({ isOwner }: { isOwner: boolean }) {
  const [source, setSource] = useState<SupabaseBrowseSource>("chat_threads");
  const [offset, setOffset] = useState(0);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [childOffset, setChildOffset] = useState(0);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [shareReason, setShareReason] = useState("");
  const [shareConfirmed, setShareConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");

  const ownerList = trpc.supabaseData.ownerList.useQuery(
    { source, limit: LIST_PAGE_SIZE, offset },
    { enabled: isOwner, retry: false, refetchOnWindowFocus: false },
  );
  const sharedList = trpc.supabaseData.sharedList.useQuery(
    { limit: LIST_PAGE_SIZE, offset },
    { enabled: !isOwner, retry: false, refetchOnWindowFocus: false },
  );
  const ownerDetail = trpc.supabaseData.ownerRecord.useQuery(
    { source, recordId: activeRecordId ?? "unselected", childLimit: CHILD_PAGE_SIZE, childOffset },
    { enabled: isOwner && Boolean(activeRecordId), retry: false, refetchOnWindowFocus: false },
  );
  const sharedDetail = trpc.supabaseData.sharedRecord.useQuery(
    { shareId: activeShareId ?? "00000000-0000-4000-8000-000000000000", childLimit: CHILD_PAGE_SIZE, childOffset },
    { enabled: !isOwner && Boolean(activeShareId), retry: false, refetchOnWindowFocus: false },
  );
  const activeShares = trpc.supabaseData.sharesForRecord.useQuery(
    { source: isShareableSource(source) ? source : "chat_threads", recordId: activeRecordId ?? "unselected" },
    { enabled: isOwner && Boolean(activeRecordId) && isShareableSource(source), retry: false },
  );
  const utils = trpc.useUtils();
  const grantShare = trpc.supabaseData.grantShare.useMutation({
    onSuccess: async () => {
      setRecipientEmail("");
      setShareReason("");
      setShareConfirmed(false);
      setActionError("");
      await activeShares.refetch();
    },
    onError: error => setActionError(error.message),
  });
  const revokeShare = trpc.supabaseData.revokeShare.useMutation({
    onSuccess: async () => {
      setActionError("");
      await activeShares.refetch();
    },
    onError: error => setActionError(error.message),
  });

  useEffect(() => {
    setOffset(0);
    setActiveRecordId(null);
    setActiveShareId(null);
    setChildOffset(0);
    setActionError("");
  }, [source]);

  const records = ownerList.data?.rows ?? [];
  const shares = sharedList.data?.rows ?? [];
  const detail = isOwner ? ownerDetail.data : sharedDetail.data;
  const detailRecord = detail?.record as Row | undefined;
  const sourceTitle = useMemo(() => SUPABASE_BROWSE_SOURCES.find(item => item.id === source)?.label ?? source, [source]);

  const chooseRecord = (row: Row) => {
    setActiveRecordId(String(row.id));
    setActiveShareId(null);
    setChildOffset(0);
    setActionError("");
    setShareConfirmed(false);
  };

  const handleGrant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeRecordId || !isShareableSource(source) || !shareConfirmed) return;
    setActionError("");
    try {
      await grantShare.mutateAsync({
        source,
        recordId: activeRecordId,
        recipientEmail: recipientEmail.trim(),
        reason: shareReason.trim(),
      });
    } catch {
      // Mutation error is already surfaced in the compact action message.
    }
  };

  const pageForward = () => {
    setOffset(current => current + LIST_PAGE_SIZE);
    setActiveRecordId(null);
    setActiveShareId(null);
  };

  return (
    <section className="data-browser" aria-label={isOwner ? "Supabase data browser" : "Shared Supabase records"}>
      <header className="data-browser-header">
        <div>
          <p className="eyebrow">{isOwner ? "OWNER ACCESS" : "SHARED WITH YOU"}</p>
          <h1>{isOwner ? "Supabase data" : "Shared records"}</h1>
          <p className="data-browser-intro">{isOwner
            ? "Existing sources are read-only. Lists are paged; private content loads only when you open a record."
            : "Only records explicitly shared with your signed-in account are available here."}</p>
        </div>
        <div className="data-browser-lock"><LockKeyhole className="size-4" /><span>SERVER AUTHORIZED</span></div>
      </header>

      <div className="data-browser-layout">
        <aside className="data-browser-list-panel">
          {isOwner ? (
            <label className="data-source-label">SOURCE
              <select value={source} onChange={event => setSource(event.target.value as SupabaseBrowseSource)}>
                {SUPABASE_BROWSE_SOURCES.map(item => <option key={item.id} value={item.id}>{item.group} · {item.label}</option>)}
              </select>
            </label>
          ) : <div className="data-source-label">ACTIVE SHARES</div>}

          {isOwner && ownerList.isLoading ? <div className="data-state"><Loader2 className="size-4 animate-spin" /> Loading metadata…</div> : null}
          {isOwner && ownerList.isError ? <div className="data-state data-error"><AlertCircle className="size-4" /><span>Supabase data could not be loaded.</span><button onClick={() => void ownerList.refetch()}><RefreshCw className="size-3.5" /> Retry</button></div> : null}
          {!isOwner && sharedList.isLoading ? <div className="data-state"><Loader2 className="size-4 animate-spin" /> Loading shared records…</div> : null}
          {!isOwner && sharedList.isError ? <div className="data-state data-error"><AlertCircle className="size-4" /><span>Shared records could not be loaded.</span><button onClick={() => void sharedList.refetch()}><RefreshCw className="size-3.5" /> Retry</button></div> : null}

          {isOwner && !ownerList.isLoading && !ownerList.isError && records.length === 0 ? <p className="data-empty">No records in this source.</p> : null}
          {isOwner && records.map(row => (
            <button key={String(row.id)} className={`data-record-row ${activeRecordId === String(row.id) ? "data-record-active" : ""}`} onClick={() => chooseRecord(row)}>
              <span className="data-record-icon"><Database className="size-3.5" /></span>
              <span className="data-record-main"><strong>{recordTitle(row, source)}</strong><small>{String(row.item_type ?? row.platform ?? row.category ?? row.memory_layer ?? row.role ?? "Record")}</small></span>
              <time>{dateLabel(row.updated_at ?? row.created_at ?? row.sent_at ?? row.recorded_at)}</time>
            </button>
          ))}
          {!isOwner && !sharedList.isLoading && !sharedList.isError && shares.length === 0 ? <p className="data-empty">No records have been shared with this account.</p> : null}
          {!isOwner && shares.map(share => (
            <button key={String(share.id)} className={`data-record-row ${activeShareId === String(share.id) ? "data-record-active" : ""}`} onClick={() => { setActiveShareId(String(share.id)); setActiveRecordId(null); setChildOffset(0); }}>
              <span className="data-record-icon"><Share2 className="size-3.5" /></span>
              <span className="data-record-main"><strong>{String(share.record_type ?? "Shared record").replaceAll("_", " ")}</strong><small>{String(share.share_reason ?? "Owner-approved share")}</small></span>
              <time>{dateLabel(share.granted_at)}</time>
            </button>
          ))}

          <div className="data-list-pagination">
            <button disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - LIST_PAGE_SIZE)); setActiveRecordId(null); setActiveShareId(null); }}><ChevronLeft className="size-3.5" /> Previous</button>
            <span>{Math.floor(offset / LIST_PAGE_SIZE) + 1}</span>
            <button disabled={isOwner ? !ownerList.data?.hasMore : !sharedList.data?.hasMore} onClick={pageForward}>Next <ChevronRight className="size-3.5" /></button>
          </div>
        </aside>

        <div className="data-browser-detail-panel">
          {!activeRecordId && !activeShareId ? (
            <div className="data-detail-empty"><Database className="size-7" /><strong>Select a record</strong><span>{isOwner ? `Browse ${sourceTitle} metadata, then open a record to load authorized details.` : "Choose one of the records the owner has explicitly shared."}</span></div>
          ) : ownerDetail.isLoading || sharedDetail.isLoading ? (
            <div className="data-state"><Loader2 className="size-4 animate-spin" /> Loading selected record…</div>
          ) : ownerDetail.isError || sharedDetail.isError ? (
            <div className="data-state data-error"><AlertCircle className="size-4" /><span>This record could not be loaded or is no longer shared.</span><button onClick={() => isOwner ? void ownerDetail.refetch() : void sharedDetail.refetch()}><RefreshCw className="size-3.5" /> Retry</button></div>
          ) : detailRecord ? (
            <>
              <div className="data-detail-heading">
                <div><p className="eyebrow">{isOwner ? sourceTitle : "OWNER-APPROVED RECORD"}</p><h2>{recordTitle(detailRecord, source)}</h2></div>
                <button className="icon-button" aria-label="Close selected record" onClick={() => { setActiveRecordId(null); setActiveShareId(null); }}><X className="size-4" /></button>
              </div>
              {!isOwner && "shareReason" in (detail ?? {}) && <p className="share-note">Shared by the BLACKTOWER owner: {String((detail as { shareReason?: string }).shareReason ?? "")}</p>}
              <div className="data-field-list">
                {Object.entries(detailRecord).filter(([key]) => key !== "id" && key !== "embedding").map(([key, value]) => (
                  <div className="data-field" key={key}><span>{key.replaceAll("_", " ")}</span><pre>{stringValue(value) || "—"}</pre></div>
                ))}
              </div>

              {"related" in (detail ?? {}) && (detail as { related?: Array<{ key: string; label: string; rows: Row[]; offset: number; limit: number; hasMore: boolean }> }).related?.map(section => (
                <section className="data-related-section" key={section.key}>
                  <div className="data-related-heading"><h3>{section.label}</h3><span>{section.rows.length} shown</span></div>
                  {section.rows.length === 0 ? <p className="data-empty">No related records on this page.</p> : section.rows.map((row, index) => (
                    <article className="data-related-row" key={String(row.id ?? index)}>
                      <div className="data-related-meta"><strong>{String(row.display_name ?? row.role ?? row.direction ?? row.summary_type ?? row.relation_type ?? row.item_type ?? "Record")}</strong><time>{dateLabel(row.created_at ?? row.sent_at)}</time></div>
                      <pre>{itemBody(row) || Object.entries(row).filter(([key]) => !["id", "thread_id", "conversation_id", "sequence"].includes(key)).map(([key, value]) => `${key.replaceAll("_", " ")}: ${stringValue(value)}`).join("\n")}</pre>
                    </article>
                  ))}
                  {section.hasMore && <button className="data-load-more" onClick={() => setChildOffset(section.offset + section.limit)}>Load next page</button>}
                </section>
              ))}

              {isOwner && activeRecordId && isShareableSource(source) && (
                <section className="data-share-section">
                  <div className="data-related-heading"><h3>Explicit shares</h3><span>Linked sources only</span></div>
                  {activeShares.isError && <p className="data-action-error">Share settings could not be loaded.</p>}
                  {activeShares.data?.map(share => (
                    <div className="data-share-row" key={String(share.id)}>
                      <span><strong>{String(share.recipient_email)}</strong><small>{String(share.share_reason)}</small></span>
                      <button disabled={revokeShare.isPending} onClick={() => void revokeShare.mutateAsync({ shareId: String(share.id) })}>Revoke</button>
                    </div>
                  ))}
                  <form className="data-share-form" onSubmit={event => void handleGrant(event)}>
                    <input type="email" required maxLength={320} value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} placeholder="Approved internal email" aria-label="Share recipient email" />
                    <input required minLength={4} maxLength={300} value={shareReason} onChange={event => setShareReason(event.target.value)} placeholder="Reason for this share" aria-label="Share reason" />
                    <label className="data-confirm-share"><input type="checkbox" checked={shareConfirmed} onChange={event => setShareConfirmed(event.target.checked)} /> I reviewed this record and approve sharing it.</label>
                    {actionError && <p className="data-action-error" role="alert">{actionError}</p>}
                    <button className="data-share-submit" type="submit" disabled={!shareConfirmed || grantShare.isPending}>{grantShare.isPending ? "Saving…" : "Grant record access"}</button>
                  </form>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
