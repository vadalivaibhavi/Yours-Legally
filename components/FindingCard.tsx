import Link from "next/link";
import { noteOnBlocker, reactToFinding, undoReaction } from "@/app/deal/actions";
import { Chip, clean, IntentBadge, Quote, SeverityBadge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Finding, SimilarPanel } from "@/lib/review/types";
import type { Reaction } from "@/lib/store";

const REASONS = ["Not a real issue", "Wrong clause / citation", "Already handled", "Accepting deliberately: one-off", "Accepting deliberately: new standard"];

/** One finding: impact, both clauses side by side, precedent, similar past clauses (reference only), reactions. */
export function FindingCard({
  f,
  dealId,
  version,
  reaction,
  blockerNote,
  similar,
  compact = false,
  readOnly = false,
}: {
  f: Finding;
  dealId: string;
  version: number;
  reaction?: Reaction;
  blockerNote?: { note: string; at: string };
  similar?: SimilarPanel;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const incoming = f.citations.filter((c) => c.role === "incoming");
  const other = f.citations.filter((c) => c.role !== "incoming");
  return (
    <article className={`card space-y-3 p-4 ${f.severity === "blocker" ? "border-l-4 !border-l-hold" : f.severity === "high" ? "border-l-4 !border-l-sendback" : ""}`}>
      <header className="flex flex-wrap items-start gap-2">
        <SeverityBadge severity={f.severity} />
        <h3 className="flex-1 font-semibold leading-snug">{f.title}</h3>
        {f.needsJudgment && <Chip tone="warn">Needs judgment / counsel</Chip>}
        {f.registerEntryId && !f.registerVerified && (
          <Link href={`/register#${f.registerEntryId}`} className="chip bg-change-soft text-change hover:underline">
            Based on an unverified register entry: verify
          </Link>
        )}
      </header>
      <p className="text-sm">{f.impact}</p>
      {f.readings && f.readings.length > 0 && (
        <div className="rounded-lg bg-paper p-3 text-sm">
          <div className="label mb-1">Two readings</div>
          <ol className="list-decimal space-y-1 pl-5">
            {f.readings.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Decision owner: <b className="text-ink">{f.owner}</b>
        </span>
        <span>Confidence: {f.confidence}</span>
        {f.expiry !== undefined && f.expiry !== null && <span>Commitment live until {fmtDate(f.expiry)}</span>}
        {f.waiver && (
          <span>
            Waiver on file ({f.waiver.covers.slice(0, 80)}…): <b className={f.waiver.applies ? "text-sign" : "text-hold"}>{f.waiver.applies ? "covers this deal" : "doesn't cover this deal"}</b>
          </span>
        )}
        {f.pendingDocument && <Chip tone="warn">Pending {f.pendingDocument}: a note doesn&apos;t clear a contractual blocker</Chip>}
      </div>

      {!compact && (incoming.length > 0 || other.length > 0) && (
        <div className={`grid gap-3 ${incoming.length && other.length ? "md:grid-cols-2" : ""}`}>
          {incoming.length > 0 && (
            <div className="space-y-2">
              <div className="label">This contract</div>
              {incoming.map((c) => (
                <Quote key={c.clauseRef + c.quote.slice(0, 20)} cite={c.clauseRef}>
                  {c.quote}
                </Quote>
              ))}
            </div>
          )}
          {other.length > 0 && (
            <div className="space-y-2">
              <div className="label">{f.category === "conflict" ? "What AtliQ already promised" : f.category === "flowdown" ? "Linked client contract" : "Source"}</div>
              {other.map((c) => (
                <Quote key={c.docId + c.clauseRef + c.quote.slice(0, 20)} cite={`${c.docTitle} ${c.clauseRef}`}>
                  {c.quote}
                </Quote>
              ))}
            </div>
          )}
        </div>
      )}
      {compact && incoming[0] && (
        <details>
          <summary className="text-sm text-brand">Clause {incoming[0].clauseRef}</summary>
          <div className="mt-2 space-y-2">
            {f.citations.map((c) => (
              <Quote key={c.docId + c.clauseRef + c.quote.slice(0, 20)} cite={`${c.role === "incoming" ? "" : c.docTitle + " "}${c.clauseRef}`}>
                {c.quote}
              </Quote>
            ))}
          </div>
        </details>
      )}

      {(f.counterPosition || f.precedents?.length) && (
        <div className="grid gap-3 text-sm md:grid-cols-2">
          {f.counterPosition && (
            <div>
              <div className="label mb-1">Ask for</div>
              <p>{f.counterPosition}</p>
            </div>
          )}
          {f.precedents && f.precedents.length > 0 && (
            <div>
              <div className="label mb-1">Your precedent</div>
              <ul className="space-y-1">
                {f.precedents.map((p) => (
                  <li key={p.docId + p.clauseRef} className="flex flex-wrap items-center gap-1.5">
                    <IntentBadge label={p.label} />
                    <span>
                      <b>{p.counterparty}</b> {p.clauseRef}: {p.note}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {similar && <SimilarDetails panel={similar} />}

      {!readOnly && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {reaction ? (
            <>
              <Chip tone={reaction.reaction === "agree" ? "good" : reaction.reaction === "disagree" ? "bad" : "brand"}>
                {reaction.reaction === "agree" ? "✓ Agreed" : reaction.reaction === "disagree" ? `✗ Disagreed: ${reaction.reason ?? ""}` : `⇅ Severity → ${reaction.severity}`}
                {reaction.version < version ? ` (from v${reaction.version})` : ""}
              </Chip>
              <form action={undoReaction}>
                <input type="hidden" name="dealId" value={dealId} />
                <input type="hidden" name="key" value={f.key} />
                <button className="text-xs text-muted underline">Change</button>
              </form>
            </>
          ) : (
            <>
              <form action={reactToFinding}>
                <Hidden dealId={dealId} f={f} version={version} reaction="agree" />
                <button className="btn">✓ Agree</button>
              </form>
              <details className="relative">
                <summary className="btn list-none">✗ Disagree</summary>
                <form action={reactToFinding} className="card absolute z-10 mt-1 w-72 space-y-2 p-3 shadow-lg">
                  <Hidden dealId={dealId} f={f} version={version} reaction="disagree" />
                  <select name="reason" required={f.severity === "blocker"} className="w-full" defaultValue="">
                    <option value="" disabled>
                      {f.severity === "blocker" ? "Reason (required)" : "Reason (optional)"}
                    </option>
                    {REASONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <input name="note" placeholder="Note (optional)" className="w-full" />
                  <button className="btn btn-primary w-full">Record</button>
                </form>
              </details>
              <details className="relative">
                <summary className="btn list-none">⇅ Severity</summary>
                <form action={reactToFinding} className="card absolute z-10 mt-1 w-56 space-y-2 p-3 shadow-lg">
                  <Hidden dealId={dealId} f={f} version={version} reaction="severity" />
                  <select name="newSeverity" className="w-full" defaultValue={f.severity}>
                    {["blocker", "high", "medium", "low"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary w-full">Change</button>
                </form>
              </details>
            </>
          )}
          {(f.category === "conflict" || f.category === "covenant") && (
            <details className="relative ml-auto">
              <summary className="text-xs text-muted underline">{blockerNote ? "Note added" : "Add a note"}</summary>
              <form action={noteOnBlocker} className="card absolute right-0 z-10 mt-1 w-80 space-y-2 p-3 shadow-lg">
                <input type="hidden" name="dealId" value={dealId} />
                <input type="hidden" name="key" value={f.key} />
                <textarea name="note" defaultValue={blockerNote?.note} placeholder="e.g. Al Noor agreed verbally to waive" className="w-full" rows={3} />
                <p className="text-xs text-muted">Shown as context. The blocker stays open until a written waiver or amendment is uploaded.</p>
                <button className="btn btn-primary w-full">Save note</button>
              </form>
            </details>
          )}
        </footer>
      )}
      {blockerNote && <p className="text-xs text-muted">Your note ({fmtDate(blockerNote.at)}): {blockerNote.note}</p>}
    </article>
  );
}

function Hidden({ dealId, f, version, reaction }: { dealId: string; f: Finding; version: number; reaction: string }) {
  return (
    <>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="key" value={f.key} />
      <input type="hidden" name="severity" value={f.severity} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="reaction" value={reaction} />
    </>
  );
}

/** FR-22: reference only. Intent label on every hit; one-offs and accidents are marked "not a precedent". */
export function SimilarDetails({ panel, open = false }: { panel: SimilarPanel; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-line bg-paper/60 p-3">
      <summary className="text-sm font-medium text-brand">
        Similar past clauses ({panel.hits.length}) · {panel.clauseType.replace("_", " ")} {panel.clauseRef}
      </summary>
      <p className="mt-1 text-xs text-muted">Reference only: never changes the severity or the verdict. Signed contracts only.</p>
      {panel.hits.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No similar clause signed before.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {panel.hits.map((h) => (
            <li key={h.docId + h.clauseNo} className="space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <IntentBadge label={h.label} />
                <b>{h.counterparty}</b>
                <span className="text-muted">
                  §{h.clauseNo} · {fmtDate(h.date)} · similarity {h.score.toFixed(2)}
                </span>
              </div>
              {h.differs && <p>How it differs: {h.differs}</p>}
              {h.labelNote && <p className="text-xs text-muted">{h.labelNote}</p>}
              {h.alsoIn.length > 0 && <p className="text-xs text-muted">Same position also in: {h.alsoIn.join(", ")}</p>}
              <details>
                <summary className="text-xs text-muted">Show clause</summary>
                <blockquote className="quote mt-1 text-xs">{clean(h.text)}</blockquote>
              </details>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
