import Link from "next/link";
import { acceptAllMedium, addMissed, clearDecision, closeAlert, confirmFact, finaliseReview, recheckDeal, recordDecision, removeMissed, reopenReview, undoConfirmation, undoFollowUp, undoReaction } from "@/app/deal/actions";
import { reviewProgress } from "@/lib/review/progress";
import { FollowUpQuestion, ResolveAlertForm, SaveButton } from "@/components/BriefControls";
import { FindingCard, SimilarDetails } from "@/components/FindingCard";
import { TextInput } from "@/components/Fields";
import { EVIDENCE_TYPES, LIMITS } from "@/lib/limits";
import { Chip, DecisionBadge, DueBadge, Quote, Section, VerdictBadge } from "@/components/ui";
import { briefVersion, briefVersions, getDeal } from "@/lib/deals";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Brief, Finding, SimilarPanel, Verdict } from "@/lib/review/types";
import type { AuditEvent } from "@/lib/store";
import { readState } from "@/lib/store";

const PANEL_FOR: Record<string, string> = {
  ld: "ld",
  payment: "payment",
  liability: "liability",
  indemnity: "indemnity",
  ip: "ip",
  flowdown_ip: "ip",
  governing_law: "governing_law",
  confidentiality: "confidentiality",
  definition: "confidentiality",
  residuals: "confidentiality",
  remedies: "confidentiality",
  data_protection: "data_protection",
  flowdown_data: "data_protection",
  restrictive: "non_compete",
};

const DECISIONS = ["Sign", "Sign after changes", "Hold", "Send back", "Reject", "Escalate to counsel"];

/**
 * The decision brief (PRD §9.1), rendered inline on the deal page under a collapsible header.
 * Karandeep only: the deal page renders it only for him, and every action re-checks the role.
 */
export async function BriefView({ dealId: id, version }: { dealId: string; version: number }) {
  const deal = getDeal(id);
  const b = briefVersion(id, version);
  if (!deal || !b) return null;
  const versions = briefVersions(id);
  const isLatest = versions[versions.length - 1]?.version === b.version;
  const s = readState();
  const reactions = s.reactions[id] ?? {};
  const notesOnBlockers = s.blockerNotes[id] ?? {};
  const confirmations = s.confirmations[id] ?? {};
  const followUp = (s.followUps[id] ?? []).find((x) => x.version === b.version);
  const missed = (s.missed[id] ?? []).filter((m) => m.version === b.version);
  const dismissed = versions.find((x) => x.version === b.version)!.findings.filter((f) => reactions[f.key]?.reaction === "disagree");
  const timeline = buildTimeline(versions, s.audit.filter((a) => a.dealId === id));
  // Review progress: every reaction is saved as it's made, so partial work survives leaving the page.
  const reactable = versions.find((x) => x.version === b.version)!.findings.filter((f) => f.severity !== "ok" && f.severity !== "low");
  const reacted = reactable.filter((f) => reactions[f.key]).length;
  const progress = isLatest ? reviewProgress(id) : null;

  const panelFor = (f: Finding): SimilarPanel | undefined => {
    const t = PANEL_FOR[f.topic];
    return t ? (b.similar.find((p) => p.clauseType === t && (!f.docId || p.docId === f.docId)) ?? b.similar.find((p) => p.clauseType === t)) : undefined;
  };
  const blockers = b.findings.filter((f) => f.severity === "blocker");
  const high = b.findings.filter((f) => f.severity === "high");
  const medium = b.findings.filter((f) => f.severity === "medium" || f.severity === "low");
  const shownBlockers = blockers.slice(0, 3);
  const usedPanels = new Set(b.findings.map((f) => panelFor(f)).filter(Boolean));
  const otherPanels = b.similar.filter((p) => !usedPanels.has(p));
  const card = (f: Finding, compact = false) => (
    <FindingCard key={f.key} f={f} dealId={id} version={b.version} reaction={reactions[f.key]} blockerNote={notesOnBlockers[f.key]} similar={panelFor(f)} compact={compact} readOnly={!isLatest} />
  );
  const changeTag = (key: string) => (b.changes ? (b.changes.new.includes(key) ? "New in this version" : "Still open since previous") : null);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- verdict first */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>Brief version</span>
          {versions.map((x) => (
            <Link key={x.version} href={`/deal/${id}?v=${x.version}&open=1#brief`} className={`chip ${x.version === b.version ? "bg-brand text-white" : "bg-gray-100"}`}>
              v{x.version}
            </Link>
          ))}
          {!isLatest && <Chip tone="warn">Older version: read only</Chip>}
        </div>
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={b.verdict} size="lg" />
            <h2 className="font-serif text-xl font-semibold">{b.headline}</h2>
            <span className="ml-auto">
              <DueBadge deadline={deal.deadline} />
            </span>
          </div>
          <p className="text-[15px]">
            <span className="label mr-2">Next</span>
            {b.nextAction}
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <Chip tone="brand">{b.route === "nda_fast_lane" ? "NDA fast lane" : "Full review"}</Chip>
            <span>
              v{b.version} · {b.trigger} · {fmtDate(b.createdAt)} · {(b.usage.ms / 1000).toFixed(0)}s{b.usage.calls === 0 ? " (cached)" : ""}
            </span>
            <span>
              register {b.registerVersion} · playbook {b.playbookVersion} · prompts {b.promptVersion} · {b.models.join(", ")}
            </span>
          </div>
          {isLatest && (
            <p className="flex flex-wrap items-center gap-2 rounded bg-paper px-3 py-2 text-xs">
              <b>Your review:</b> {progress?.reacted ?? reacted} of {progress?.total ?? reactable.length} findings answered ·{" "}
              {deal.decision ? (
                <>
                  {deal.finalised ? "finalised" : "draft decision"} <DecisionBadge decision={deal.decision} />
                </>
              ) : (
                "no decision yet"
              )}
              <span className="ml-auto text-muted">Saved automatically</span>
            </p>
          )}
          {deal.stale && <p className="rounded bg-change-soft p-2 text-sm text-change">The register changed since this brief ({fmtDate(deal.stale)}). Re-check to apply it.</p>}
        </div>
      </div>

      {/* ---------------------------------------------------------------- pinned compliance alert (FR-21) */}
      {b.complianceAlert && (
        <section className={`card space-y-3 border-2 p-5 ${b.complianceAlert.status === "open" ? "border-hold bg-hold-soft/40" : "border-sign/40"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={b.complianceAlert.status === "open" ? "bad" : "good"}>{b.complianceAlert.status === "open" ? "Compliance alert: open" : "Compliance alert: resolved"}</Chip>
            <h2 className="font-semibold">{b.complianceAlert.title}</h2>
          </div>
          <p className="text-sm">{b.complianceAlert.detail}</p>
          <p className="text-xs text-muted">
            Owner: {b.complianceAlert.owner}. The verdict can&apos;t be SIGN while this is open.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {b.complianceAlert.citations.map((c, i) => (
                <Quote key={i} cite={`${c.docTitle} ${c.clauseRef}`}>
                {c.quote}
              </Quote>
            ))}
          </div>
          {b.complianceAlert.status === "resolved" ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-sign">✓ {b.complianceAlert.resolution}</span>
              {b.complianceAlert.evidenceFile && (
                <a href={`/evidence/${b.complianceAlert.evidenceFile.stored}`} target="_blank" className="underline">
                  📄 Open {b.complianceAlert.evidenceFile.name}
                </a>
              )}
              {isLatest && (
                <form action={closeAlert}>
                  <input type="hidden" name="dealId" value={id} />
                  <input type="hidden" name="how" value="open" />
                  <SaveButton className="text-xs text-muted underline">Reopen</SaveButton>
                </form>
              )}
            </div>
          ) : (
            isLatest && <ResolveAlertForm dealId={id} accept={EVIDENCE_TYPES.join(",")} />
          )}
          {isLatest &&
            b.complianceAlert.factIds.map((fid) => (
              <form key={fid} action={undoConfirmation} className="text-xs text-muted">
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="factId" value={fid} />
                You confirmed this from the deal notes. <SaveButton className="underline">Change</SaveButton>
              </form>
            ))}
        </section>
      )}
      {!b.complianceAlert && b.complianceCandidate && isLatest && (
        <section className="card space-y-3 border-2 border-change p-5">
          <Chip tone="warn">Possible compliance event: please confirm</Chip>
          {b.notesFacts
            .filter((f) => f.complianceEvent)
            .map((f) => (
              <FactRow key={f.id} fact={f} dealId={id} state={confirmations[f.id]?.status} />
            ))}
          <p className="text-xs text-muted">Confirming raises a compliance alert.</p>
        </section>
      )}

      {/* ---------------------------------------------------------------- version changes (FR-17) */}
      {b.changes && (
        <Section title={`Since v${b.version - 1}`}>
          <div className="card grid gap-4 p-4 text-sm md:grid-cols-3">
            <div>
              <div className="label mb-1">New in this version · {b.changes.new.length}</div>
              <ul className="list-disc pl-5">{b.changes.new.map((k) => <li key={k}>{b.findings.find((f) => f.key === k)?.title ?? k}</li>)}</ul>
            </div>
            <div>
              <div className="label mb-1">Still open since previous · {b.changes.stillOpen.length}</div>
              <ul className="list-disc pl-5">{b.changes.stillOpen.map((k) => <li key={k}>{b.findings.find((f) => f.key === k)?.title ?? k}</li>)}</ul>
            </div>
            <div>
              <div className="label mb-1">Resolved since previous · {b.changes.resolved.length}</div>
              <ul className="list-disc pl-5 text-sign">{b.changes.resolved.map((f) => <li key={f.key}>{f.title}</li>)}</ul>
            </div>
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- blockers (max 3) */}
      {blockers.length > 0 && (
        <Section title={`Blockers · ${blockers.length}`} aside={blockers.length > 3 ? <span className="text-xs text-muted">Top 3 shown; the rest are under Must fix</span> : null}>
          <div className="space-y-3">
            {shownBlockers.map((f) => (
              <div key={f.key}>
                {changeTag(f.key) && <div className="label mb-1">{changeTag(f.key)}</div>}
                {card(f)}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- waiting for input */}
      {b.waitingFor.length > 0 && (
        <Section title={`Waiting for input · ${b.waitingFor.length}`}>
          <div className="card divide-y divide-line">
            {b.waitingFor.map((w) => (
              <div key={w.item} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span>📎 {w.item}</span>
                <span className="ml-auto text-muted">owner: {w.owner}</span>
              </div>
            ))}
            {isLatest && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link href={`/upload?deal=${id}`} className="btn">
                  Upload it here
                </Link>
                <form action={recheckDeal}>
                  <input type="hidden" name="dealId" value={id} />
                  <SaveButton className="btn btn-primary" savedLabel="Re-checked ✓" pendingLabel="Re-checking… (1–3 min)">Input added → re-check</SaveButton>
                </form>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- must fix */}
      {(high.length > 0 || blockers.length > 3) && (
        <Section title={`Must fix · ${high.length + Math.max(0, blockers.length - 3)}`}>
          <div className="space-y-3">{[...blockers.slice(3), ...high].map((f) => card(f))}</div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- please confirm (notes) */}
      {b.notesFacts.filter((f) => !f.complianceEvent && f.category !== "deadline" && f.category !== "other").length > 0 && (
        <Section title="Please confirm (from deal notes)">
          <div className="card divide-y divide-line">
            {b.notesFacts
              .filter((f) => !f.complianceEvent && f.category !== "deadline" && f.category !== "other")
              .map((f) => (
                <FactRow key={f.id} fact={f} dealId={id} state={confirmations[f.id]?.status} />
              ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- worth negotiating */}
      {medium.length > 0 && (
        <Section
          title={`Worth negotiating · ${medium.length}`}
          aside={
            isLatest && (
              <form action={acceptAllMedium}>
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="version" value={b.version} />
                <input type="hidden" name="keys" value={medium.map((f) => f.key).join(",")} />
                <SaveButton className="text-xs text-brand underline">Accept all (medium items only)</SaveButton>
              </form>
            )
          }
        >
          <details className="space-y-3">
            <summary className="text-sm text-muted">Show {medium.length} item{medium.length > 1 ? "s" : ""}</summary>
            <div className="mt-3 space-y-3">{medium.map((f) => card(f, true))}</div>
          </details>
        </Section>
      )}

      {/* ---------------------------------------------------------------- what's fine / not seen */}
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="What's fine">
          <div className="card p-4 text-sm">
            <ul className="space-y-1">
              {b.fine.map((x) => (
                <li key={x}>✓ {x}</li>
              ))}
            </ul>
          </div>
        </Section>
        <Section title="What wasn't seen">
          <div className="card p-4 text-sm">
            <ul className="space-y-1">
              {b.notSeen.map((x) => (
                <li key={x}>◌ {x}</li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

      {/* ---------------------------------------------------------------- deal bundle */}
      {b.bundle.length > 0 && (
        <Section title="Deal bundle: documents each party needs">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {b.bundle.map((r) => (
                  <tr key={r.party + r.document} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{r.party}</td>
                    <td className="px-4 py-2">{r.document}</td>
                    <td className="px-4 py-2">
                      <Chip tone={r.status === "signed" ? "good" : r.status === "in_review" ? "brand" : "bad"}>{r.status.replace("_", " ")}</Chip>
                    </td>
                    <td className="px-4 py-2 text-muted">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- other key clauses vs past */}
      {otherPanels.length > 0 && (
        <Section title="Clauses with no issue: how they compare with what you've signed">
          <p className="text-sm text-muted">Clauses that raised nothing, next to the closest wording you&apos;ve signed.</p>
          <div className="space-y-2">
            {otherPanels.map((p) => (
              <SimilarDetails key={p.docId + p.clauseType} panel={p} />
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- counsel pack (tier 4, preview) */}
      {b.counselPack && (
        <Section title="Counsel pack (preview: prepared for you to send)">
          <details className="card p-4 text-sm">
            <summary className="font-medium">
              The exact question · {b.counselPack.documents.length} documents · {b.counselPack.clauses.length} clauses
            </summary>
            <pre className="mt-3 whitespace-pre-wrap font-sans">{b.counselPack.question}</pre>
            <div className="label mt-3">Documents</div>
            <ul className="list-disc pl-5">
              {b.counselPack.documents.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <div className="label mt-3">Entity facts</div>
            <ul className="list-disc pl-5">
              {b.counselPack.entityFacts.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        </Section>
      )}

      {dismissed.length > 0 && (
        <Section title={`Dismissed by you · ${dismissed.length}`}>
          <div className="card divide-y divide-line text-sm">
            {dismissed.map((f) => (
              <form key={f.key} action={undoReaction} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="key" value={f.key} />
                <span>{f.title}</span>
                <span className="text-muted">· {reactions[f.key]?.reason ?? "no reason given"}</span>
                {isLatest && <SaveButton className="ml-auto text-xs text-muted underline">Change</SaveButton>}
              </form>
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- decision history (versions + decisions) */}
      <Section title="Decision history">
        <ol className="card space-y-3 p-5 text-sm">
          {timeline.map((t, i) => (
            <li key={i} className="grid grid-cols-[8.5rem_1fr] gap-3">
              <span className="text-xs text-muted">{t.when}</span>
              <span className="flex flex-wrap items-center gap-2">
                {t.kind === "decision" ? (
                  <DecisionBadge decision={t.label} />
                ) : t.kind === "verdict" ? (
                  <VerdictBadge verdict={t.label as Verdict} />
                ) : (
                  <Chip tone={t.kind === "cleared" ? "gray" : "warn"}>{t.label}</Chip>
                )}
                <span className={t.kind === "decision" ? "font-semibold" : "text-muted"}>{t.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------------- decision & feedback panel (FR-12) */}
      {isLatest && (
        <Section title="What's your call?">
          <div className="card space-y-4 p-5">
            {deal.decision ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">{deal.finalised ? "Your decision:" : "Draft decision:"}</span>
                <DecisionBadge decision={deal.decision} size="lg" />
                <span className="text-xs text-muted">recorded {fmtDateTime(deal.decidedAt)}</span>
                <form action={clearDecision}>
                  <input type="hidden" name="dealId" value={id} />
                  <SaveButton className="text-xs text-muted underline">Clear decision</SaveButton>
                </form>
              </div>
            ) : (
              <p className="text-sm text-muted">No decision yet.</p>
            )}
            <form action={recordDecision} className="flex flex-wrap gap-2">
              <input type="hidden" name="dealId" value={id} />
              <input type="hidden" name="version" value={b.version} />
              {DECISIONS.map((d) => (
                <SaveButton key={d} name="decision" value={d} className={`btn ${deal.decision === d ? "btn-primary" : ""}`}>
                  {d}
                </SaveButton>
              ))}
            </form>
            <p className="text-xs text-muted">Records your decision only. Nothing is sent or signed.</p>
            {deal.decision &&
              (followUp ? (
                <form action={undoFollowUp} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper p-3 text-sm">
                  <input type="hidden" name="dealId" value={id} />
                  <input type="hidden" name="version" value={b.version} />
                  <span>Needed to open the full contract or other documents?</span>
                  <b>{followUp.answer === "no" ? "No, decided from the brief" : "Yes"}</b>
                  {followUp.answer === "yes" && (followUp.reason || followUp.note) && <span>· {[followUp.reason, followUp.note].filter(Boolean).join(": ")}</span>}
                  <SaveButton className="ml-auto text-xs text-muted underline">Change</SaveButton>
                </form>
              ) : (
                <FollowUpQuestion dealId={id} version={b.version} />
              ))}
            {/* Two-step: everything answered, then finalise. Only a finalised review shows as Decided. */}
            {progress &&
              (progress.finalised ? (
                <form action={reopenReview} className="flex flex-wrap items-center gap-3 rounded-lg border border-sign/40 bg-sign-soft p-3 text-sm">
                  <input type="hidden" name="dealId" value={id} />
                  <b className="text-sign">✓ Review finalised {fmtDateTime(progress.finalisedAt)}</b>
                  <span className="text-muted">Status: Decided</span>
                  <SaveButton className="ml-auto text-xs text-muted underline">Reopen review</SaveButton>
                </form>
              ) : (
                <form action={finaliseReview} className={`flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm ${progress.complete ? "border-2 border-brand bg-brand-soft" : "bg-paper"}`}>
                  <input type="hidden" name="dealId" value={id} />
                  {progress.complete ? (
                    <b>Everything is answered. Finalise to mark this deal Decided.</b>
                  ) : (
                    <span>
                      <b>Still to do before finalising:</b> {progress.missing.join(" · ")}
                    </span>
                  )}
                  {progress.complete ? (
                    <SaveButton className="btn btn-primary ml-auto" savedLabel="Finalised ✓">
                      Finalise review
                    </SaveButton>
                  ) : (
                    <button type="button" className="btn ml-auto" disabled>
                      Finalise review
                    </button>
                  )}
                </form>
              ))}
            <details>
              <summary className="text-sm text-brand">+ Something the brief missed</summary>
              <form action={addMissed} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="version" value={b.version} />
                <TextInput name="clauseRef" placeholder="Clause (e.g. §7.2)" max={LIMITS.clauseRef} className="w-40" />
                <TextInput name="note" placeholder="What did it miss?" required max={LIMITS.note} className="min-w-72 flex-1" />
                <SaveButton>Add</SaveButton>
              </form>
            </details>
            {missed.map((m) => (
              <form key={m.at} action={removeMissed} className="text-xs text-muted">
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="at" value={m.at} />
                Added: {m.clauseRef} {m.note} (becomes an eval regression case) <SaveButton className="underline">Remove</SaveButton>
              </form>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function FactRow({ fact, dealId, state }: { fact: { id: string; statement: string; quote: string; noteTitle: string; whyItMatters: string }; dealId: string; state?: string }) {
  return (
    <div className="space-y-2 p-4 text-sm">
      <p>
        ❓ <b>{fact.statement}</b>
      </p>
      <Quote cite={fact.noteTitle}>{fact.quote}</Quote>
      <p className="text-xs text-muted">{fact.whyItMatters}</p>
      {state ? (
        <form action={undoConfirmation} className="flex items-center gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="factId" value={fact.id} />
          <Chip tone={state === "not_true" ? "gray" : "warn"}>{state === "confirmed" ? "Confirmed" : state === "not_true" ? "Marked not true" : "Edited"}</Chip>
          <SaveButton className="text-xs text-muted underline">Change</SaveButton>
        </form>
      ) : (
        <form action={confirmFact} className="flex flex-wrap gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="factId" value={fact.id} />
          <SaveButton name="status" value="confirmed">
            Confirm
          </SaveButton>
          <SaveButton name="status" value="not_true">
            Not true
          </SaveButton>
          <TextInput name="edit" placeholder="Correct it…" max={LIMITS.note} className="w-64" />
          <SaveButton name="status" value="edited">
            Edit
          </SaveButton>
        </form>
      )}
    </div>
  );
}

type TimelineItem = { at: string; when: string; kind: "verdict" | "decision" | "cleared" | "alert"; label: string; text: string };

/** How the verdict and Karandeep's decision changed, across brief versions and over time. */
function buildTimeline(versions: Brief[], audit: AuditEvent[]): TimelineItem[] {
  const items: TimelineItem[] = versions.map((v) => ({ at: v.createdAt, when: fmtDateTime(v.createdAt), kind: "verdict", label: v.verdict, text: `Brief v${v.version} issued (${v.trigger}): system verdict` }));
  for (const a of audit) {
    const d = (a.detail ?? {}) as Record<string, string>;
    if (a.action === "decision") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "decision", label: d.decision, text: `${a.user} chose${d.version ? ` on brief v${d.version}` : ""} (draft)` });
    else if (a.action === "decision.clear") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "cleared", label: "Decision cleared", text: `by ${a.user}` });
    else if (a.action === "fact.confirmed") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "alert", label: "Compliance event confirmed", text: "from the deal notes" });
    else if (a.action === "alert.evidence" || a.action === "alert.note") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "alert", label: "Compliance alert resolved", text: [d.file, d.note].filter(Boolean).join(": ") });
    else if (a.action === "alert.open") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "alert", label: "Compliance alert reopened", text: "" });
    else if (a.action === "review.finalised") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "decision", label: d.decision, text: `${a.user} finalised the review: status Decided` });
    else if (a.action === "review.reopened") items.push({ at: a.at, when: fmtDateTime(a.at), kind: "cleared", label: "Review reopened", text: "back in review" });
  }
  return items.sort((x, y) => x.at.localeCompare(y.at));
}
