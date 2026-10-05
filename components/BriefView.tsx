import Link from "next/link";
import { acceptAllMedium, addMissed, answerFollowUp, closeAlert, confirmFact, recheckDeal, recordDecision } from "@/app/deal/actions";
import { FindingCard, SimilarDetails } from "@/components/FindingCard";
import { EvidenceField, TextInput } from "@/components/Fields";
import { EVIDENCE_TYPES, LIMITS } from "@/lib/limits";
import { Chip, DueBadge, Quote, Section, VerdictBadge } from "@/components/ui";
import { briefVersion, briefVersions, getDeal } from "@/lib/deals";
import { fmtDate } from "@/lib/format";
import type { Finding, SimilarPanel } from "@/lib/review/types";
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
            Owner: {b.complianceAlert.owner}. The analysis below is complete; the verdict can&apos;t be SIGN while this is open. Yours Legally notifies no one: next steps are a human decision (counsel, client, regulator).
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {b.complianceAlert.citations.map((c, i) => (
                <Quote key={i} cite={`${c.docTitle} ${c.clauseRef}`}>
                {c.quote}
              </Quote>
            ))}
          </div>
          {b.complianceAlert.status === "resolved" ? (
            <p className="text-sm font-medium text-sign">
              {b.complianceAlert.resolution}
              {b.complianceAlert.evidenceFile && (
                <a href={`/evidence/${b.complianceAlert.evidenceFile.stored}`} target="_blank" className="ml-2 underline">
                  📄 Open {b.complianceAlert.evidenceFile.name}
                </a>
              )}
            </p>
          ) : (
            isLatest && (
              <div className="flex flex-wrap gap-2">
                <form action={closeAlert} className="flex flex-wrap gap-2">
                  <input type="hidden" name="dealId" value={id} />
                  <input type="hidden" name="how" value="evidence" />
                  <EvidenceField maxText={LIMITS.evidence} accept={EVIDENCE_TYPES.join(",")} />
                  <button className="btn">Resolved: attach evidence</button>
                </form>
                <form action={closeAlert} className="flex flex-wrap gap-2">
                  <input type="hidden" name="dealId" value={id} />
                  <input type="hidden" name="how" value="note" />
                  <TextInput name="note" placeholder="Your attested note" required max={LIMITS.note} className="w-80" />
                  <button className="btn">Resolved off the record: add note</button>
                </form>
              </div>
            )
          )}
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
          <p className="text-xs text-muted">Confirming pins a compliance alert for Karandeep and the named owner. The system takes no action itself.</p>
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
        <Section title={`Blockers · ${blockers.length}`} aside={blockers.length > 3 ? <span className="text-xs text-muted">Top 3 shown; the rest are under &quot;More&quot;</span> : null}>
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
                  <button className="btn btn-primary">Input added → re-check</button>
                </form>
                <span className="text-xs text-muted">Issues v{b.version + 1}: New · Still open · Resolved; your reactions carry forward.</span>
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
                <button className="text-xs text-brand underline">Accept all (medium items only)</button>
              </form>
            )
          }
        >
          <details className="space-y-3">
            <summary className="text-sm text-muted">Show {medium.length} negotiable item{medium.length > 1 ? "s" : ""} with your counter-positions</summary>
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

      {/* ---------------------------------------------------------------- contract facts card (FR-4) */}
      <Section title="Contract facts">
        <div className="space-y-3">
          {b.documents.map((d) => (
            <details key={d.docId} className="card p-4" open={b.documents.length === 1}>
              <summary className="font-semibold">
                {d.title} <span className="text-xs font-normal text-muted">· {d.docType} · {d.paper === "atliq" ? "AtliQ's paper (mirror mode)" : "their paper"}</span>
              </summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <table className="text-sm">
                  <tbody>
                    {d.facts.map((f) => (
                      <tr key={f.field} className="align-top">
                        <td className="w-40 py-1 pr-3 text-muted">{f.label}</td>
                        <td className="py-1">
                          {f.value}
                          {f.quote && (
                            <details>
                              <summary className="text-xs text-brand">{f.clauseRef ?? "source"}</summary>
                              <blockquote className="quote mt-1 text-xs">{f.quote}</blockquote>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="space-y-1 text-sm">
                  {d.gate.map((g) => (
                    <li key={g.rule} className="flex gap-2">
                      <span className={g.pass === true ? "text-sign" : g.pass === false ? "text-hold" : "text-muted"}>{g.pass === true ? "✓" : g.pass === false ? "✗" : "–"}</span>
                      <span>
                        <b>{g.label}</b>: {g.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- other key clauses vs past */}
      {otherPanels.length > 0 && (
        <Section title="Other key clauses vs what you've signed before">
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
            <summary className="font-medium">The exact question · {b.counselPack.documents.length} documents · {b.counselPack.clauses.length} clauses</summary>
            <pre className="mt-3 whitespace-pre-wrap font-sans">{b.counselPack.question}</pre>
            <div className="label mt-3">Documents</div>
            <ul className="list-disc pl-5">{b.counselPack.documents.map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="label mt-3">Entity facts</div>
            <ul className="list-disc pl-5">{b.counselPack.entityFacts.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="mt-3 text-xs text-muted">Export is a static preview in the prototype. Yours Legally never sends anything to counsel.</p>
          </details>
        </Section>
      )}

      {dismissed.length > 0 && (
        <Section title={`Dismissed by you · ${dismissed.length}`}>
          <div className="card divide-y divide-line text-sm">
            {dismissed.map((f) => (
              <div key={f.key} className="px-4 py-2">
                {f.title} <span className="text-muted">· {reactions[f.key]?.reason}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- decision & feedback panel (FR-12) */}
      {isLatest && (
        <Section title="What's your call?">
          <div className="card space-y-4 p-5">
            <form action={recordDecision} className="flex flex-wrap gap-2">
              <input type="hidden" name="dealId" value={id} />
              <input type="hidden" name="version" value={b.version} />
              {DECISIONS.map((d) => (
                <button key={d} name="decision" value={d} className={`btn ${deal.decision === d ? "btn-primary" : ""}`}>
                  {d}
                </button>
              ))}
            </form>
            <p className="text-sm text-muted">
              This simply records where things stand, so {deal.owner === "Karandeep" ? "the queue" : `${deal.owner} and the queue`} stay in step with you. Nothing is sent, signed or shared on your behalf; the replies and the conversations with{" "}
              {deal.counterparty} remain yours.
            </p>
            {deal.decision && (
              <p className="text-sm">
                Recorded: <b>{deal.decision}</b> ({fmtDate(deal.decidedAt)})
              </p>
            )}
            {deal.decision && !followUp && (
              <form action={answerFollowUp} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper p-3 text-sm">
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="version" value={b.version} />
                <span>Did you need to open the full contract or other documents to decide?</span>
                <button name="answer" value="no" className="btn">
                  No
                </button>
                <select name="reason" defaultValue="">
                  <option value="">Yes, because…</option>
                  <option>Missing context</option>
                  <option>Didn&apos;t trust a citation</option>
                  <option>Brief unclear</option>
                </select>
                <button name="answer" value="yes" className="btn">
                  Yes
                </button>
              </form>
            )}
            {followUp && <p className="text-xs text-muted">Follow-up recorded: {followUp.answer === "no" ? "decided from the brief" : `had to dig (${followUp.reason ?? "no reason"})`}.</p>}
            <details>
              <summary className="text-sm text-brand">+ Something the brief missed</summary>
              <form action={addMissed} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="dealId" value={id} />
                <input type="hidden" name="version" value={b.version} />
                <TextInput name="clauseRef" placeholder="Clause (e.g. §7.2)" max={LIMITS.clauseRef} className="w-40" />
                <TextInput name="note" placeholder="What did it miss?" required max={LIMITS.note} className="min-w-72 flex-1" />
                <button className="btn">Add</button>
              </form>
              {missed.map((m) => (
                <p key={m.at} className="mt-1 text-xs text-muted">
                  Added: {m.clauseRef} {m.note} (becomes an eval regression case)
                </p>
              ))}
            </details>
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
        <Chip tone={state === "not_true" ? "gray" : "warn"}>{state === "confirmed" ? "Confirmed" : state === "not_true" ? "Marked not true" : "Edited"}</Chip>
      ) : (
        <form action={confirmFact} className="flex flex-wrap gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="factId" value={fact.id} />
          <button name="status" value="confirmed" className="btn">
            Confirm
          </button>
          <button name="status" value="not_true" className="btn">
            Not true
          </button>
          <TextInput name="edit" placeholder="Correct it…" max={LIMITS.note} className="w-64" />
          <button name="status" value="edited" className="btn">
            Edit
          </button>
        </form>
      )}
    </div>
  );
}
