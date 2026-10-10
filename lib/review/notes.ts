/**
 * FR-10 notes scan (fast model): deal-linked meeting notes + tracker notes → facts about data
 * movement, staffing and commitments, presented as "please confirm" prompts (Confirm / Not true / Edit).
 * A confirmed compliance event (regulated data moved before the required agreement) raises the
 * pinned compliance alert (FR-21). The system never handles it itself or notifies anyone.
 */
import { z } from "zod";
import { OWNER } from "./owners";
import { callModel } from "../llm";
import { locateQuote } from "../quotes";
import type { Deal, Note } from "../types";
import type { BundleRow, Citation, ComplianceAlert, Finding, NotesFact } from "./types";

const Result = z.object({
  facts: z.array(
    z.object({
      statement: z.string().describe("The fact, as a short statement to confirm"),
      category: z.enum(["data_movement", "staffing", "commitment", "deadline", "other"]),
      source: z.string().describe("note id, or 'tracker'"),
      quote: z.string().describe("VERBATIM from that note"),
      complianceEvent: z.boolean().describe("true ONLY if regulated or personal data has ALREADY moved or been accessed before the agreement that must cover it exists"),
      whyItMatters: z.string(),
    }),
  ),
});

const REGULATED_DATA = /\b(patient|phi|diagnos|dob|date of birth|medical|health record|real data|personal data|guest data|sample extract)\b/i;
const SHARED = /\b(sent|emailed|forwarded|shared|extract|uploaded|opened|profil|gave|access)/i;

const SYSTEM = `You read meeting notes and tracker notes attached to ONE deal and pull out facts the contract reviewer must confirm: data that has moved or been shared (and with whom, where), who is staffed or reused, commitments made to the client, deadlines.
Only facts about THIS deal. Quote VERBATIM. Mark complianceEvent=true only when regulated/personal data (e.g. patient data) has already moved or been accessed before the agreement that must cover it is signed. Never suggest workarounds. Never say "breach".`;

export async function scanNotes(args: { deal: Deal; notes: Note[]; bundle: BundleRow[] }): Promise<{ facts: NotesFact[]; findings: Finding[]; candidate: ComplianceAlert | null; error?: string }> {
  const { deal, notes } = args;
  const tracker = deal.trackerNotes.join("\n");
  if (!notes.length && !tracker) return { facts: [], findings: [], candidate: null };
  const input = [
    `Deal: ${deal.name} · counterparty ${deal.counterparty} · owner ${deal.owner}`,
    args.bundle.length ? `Agreements status for this deal:\n${args.bundle.map((b) => `- ${b.party}: ${b.document}: ${b.status} (${b.detail})`).join("\n")}` : "",
    ...notes.map((n) => `### note ${n.id}: ${n.title} (${n.date})\n${n.text}`),
    tracker ? `### tracker\n${tracker}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await callModel({ task: "notes", system: SYSTEM, input, schema: Result });
  if (!r.ok) return { facts: [], findings: [], candidate: null, error: `Notes scan ${r.message}` };

  const facts: NotesFact[] = [];
  r.data.facts.forEach((f, i) => {
    const note = notes.find((n) => n.id === f.source) ?? notes.find((n) => locateQuote(n.text, f.quote));
    const text = note?.text ?? tracker;
    const q = locateQuote(text, f.quote);
    if (!q) return; // never show a fact we can't point to
    facts.push({ id: `${deal.id}-fact-${i + 1}`, statement: f.statement, category: f.category, noteId: note?.id ?? "tracker", noteTitle: note?.title ?? "Tracker notes", quote: q, complianceEvent: f.complianceEvent, whyItMatters: f.whyItMatters });
  });

  // Rule backstop (a missed compliance event is the worst failure): a note line that mentions regulated
  // data being shared, on a deal whose required data agreement isn't signed, is always surfaced.
  const agreementMissing = args.bundle.some((b) => /BAA|DPA/i.test(b.document) && b.status !== "signed");
  if (agreementMissing && !facts.some((f) => f.complianceEvent)) {
    for (const n of notes) {
      const line = n.text.split("\n").find((l) => REGULATED_DATA.test(l) && SHARED.test(l));
      if (line)
        facts.push({
          id: `${deal.id}-fact-rule-${n.id}`,
          statement: `Regulated data may already have been shared before the required agreement: "${line.replace(/^[-*\s]+/, "").slice(0, 160)}"`,
          category: "data_movement",
          noteId: n.id,
          noteTitle: n.title,
          quote: line.trim(),
          complianceEvent: true,
          whyItMatters: `The note mentions real or regulated data being shared, while ${args.bundle.filter((b) => /BAA|DPA/i.test(b.document) && b.status !== "signed").map((b) => `${b.document} (${b.party})`).join(", ")} is not signed.`,
        });
    }
  }

  const events = facts.filter((f) => f.complianceEvent);
  const findings: Finding[] = events.map((f) => ({
    key: `notes:${f.category}`,
    category: "notes",
    topic: f.category,
    title: `From deal notes (please confirm): ${f.statement}`,
    impact: f.whyItMatters,
    severity: "high",
    confidence: "medium",
    needsJudgment: false,
    owner: "Karandeep",
    resolution: "confirm",
    citations: [{ docId: f.noteId, docTitle: f.noteTitle, clauseRef: "note", quote: f.quote, role: "note" } as Citation],
  }));
  const candidate: ComplianceAlert | null = events.length
    ? {
        title: events[0].statement,
        detail: events.map((e) => e.whyItMatters).join(" "),
        owner: OWNER.compliance,
        factIds: events.map((e) => e.id),
        citations: events.map((e) => ({ docId: e.noteId, docTitle: e.noteTitle, clauseRef: "note", quote: e.quote, role: "note" as const })),
      }
    : null;
  return { facts, findings, candidate };
}
