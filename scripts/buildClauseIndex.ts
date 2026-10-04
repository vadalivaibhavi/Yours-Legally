/**
 * Phase 1c: signed contracts → clause chunks + types + intent labels + embeddings → data/clause_index.json (FR-22).
 * Only SIGNED documents are indexed (drafts never appear as precedent). Embedded once, here, not at review time.
 */
import "./_env";
import { z } from "zod";
import { chunkDocument, typeFromHeading } from "../lib/chunker";
import { readJson, writeJson } from "../lib/config";
import { drainEmbedTokens, embed, EMBED_DIM, embedModel, embedProvider } from "../lib/embed";
import { callModel, drainUsage } from "../lib/llm";
import { ClauseType, type ClauseChunk, type Document, type IntentLabel } from "../lib/types";

type LabelRule = { docId: string; clauses?: string[]; clauseTypes?: string[]; label: IntentLabel; note: string };

async function main() {
  const t0 = Date.now();
  const docs = readJson<Document[]>("documents.json").filter((d) => d.kind === "signed" && d.docType !== "Waiver");
  const labels = readJson<{ labels: LabelRule[] }>("seed/labels.seed.json").labels;

  type Draft = Omit<ClauseChunk, "embedding" | "clauseType" | "label"> & { clauseType: ClauseType | null; label: IntentLabel };
  const drafts: Draft[] = [];
  for (const d of docs) {
    for (const c of chunkDocument(d.text)) {
      drafts.push({
        id: `${d.id}§${c.clauseNo}`,
        docId: d.id,
        counterparty: d.counterparty,
        date: d.date,
        atliqEntity: d.atliqEntity,
        sideOfTable: d.sideOfTable,
        clauseNo: c.clauseNo,
        heading: c.heading,
        text: c.text,
        clauseType: typeFromHeading(c.heading, d.docType),
        label: "untagged",
      });
    }
  }

  // The fast model only for headings the keyword map can't place (Phase 1 spec 1c).
  const unclear = drafts.filter((c) => c.clauseType === null);
  if (unclear.length) {
    const schema = z.object({ items: z.array(z.object({ id: z.string(), clauseType: ClauseType })) });
    const r = await callModel({
      task: "classify",
      system: "Classify each contract clause into exactly one clause type. Use 'other' when none fits.",
      input: unclear.map((c) => `id: ${c.id}\nheading: ${c.heading}\ntext: ${c.text.slice(0, 600)}`).join("\n\n---\n\n"),
      schema,
    });
    const map = new Map(r.ok ? r.data.items.map((i) => [i.id, i.clauseType]) : []);
    for (const c of unclear) c.clauseType = map.get(c.id) ?? "other";
    console.log(`fast-model typing for ${unclear.length} unclear headings: ${unclear.map((c) => `${c.heading}→${c.clauseType}`).join("; ")}`);
  }

  // Intent labels from labels.seed.json (Karandeep's tagging); everything else stays "untagged".
  for (const c of drafts) {
    const section = c.clauseNo.split(/[.–]/)[0];
    const rule = labels.find(
      (l) => l.docId === c.docId && ((l.clauses && (l.clauses.includes("*") || l.clauses.includes(section))) || (l.clauseTypes && l.clauseTypes.includes(c.clauseType!))),
    );
    if (rule) {
      c.label = rule.label;
      (c as ClauseChunk).labelNote = rule.note;
    }
  }

  const vectors = await embed(drafts.map((c) => `${c.heading}\n${c.text}`.slice(0, 3000)));
  const chunks: ClauseChunk[] = drafts.map((c, i) => ({ ...c, clauseType: c.clauseType ?? "other", embedding: vectors[i] }));

  writeJson("clause_index.json", { builtAt: new Date().toISOString(), embedProvider: embedProvider(), embedModel: embedModel(), dim: EMBED_DIM, chunks });

  const usage = drainUsage();
  const run = {
    script: "buildClauseIndex",
    at: new Date().toISOString(),
    chunks: chunks.length,
    embedProvider: embedProvider(),
    embedModel: embedModel(),
    embedTokensApprox: drainEmbedTokens(),
    llmCalls: usage.filter((u) => !u.cached).length,
    llmInputTokens: usage.reduce((s, u) => s + u.usage.inputTokens, 0),
    llmOutputTokens: usage.reduce((s, u) => s + u.usage.outputTokens, 0),
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  writeJson(`runs/clause-index-${run.at.slice(0, 19).replace(/[:T]/g, "-")}.json`, run);

  // Summary (Phase 1 exit check item 2)
  console.log(`\nclause index: ${chunks.length} chunks from ${docs.length} signed documents (${run.seconds}s, ~${run.embedTokensApprox} embed tokens)`);
  const types = [...new Set(chunks.map((c) => c.clauseType))].sort();
  console.log(`\n${"contract".padEnd(16)} ${types.map((t) => t.slice(0, 6).padStart(7)).join("")}  total`);
  for (const d of docs) {
    const mine = chunks.filter((c) => c.docId === d.id);
    console.log(`${d.id.padEnd(16)} ${types.map((t) => String(mine.filter((c) => c.clauseType === t).length || "·").padStart(7)).join("")}  ${String(mine.length).padStart(5)}`);
  }
  console.log(`\nlabelled chunks:`);
  for (const c of chunks.filter((c) => c.label !== "untagged")) console.log(`  ${c.label.padEnd(10)} ${c.id.padEnd(24)} ${c.clauseType.padEnd(16)} ${c.heading}`);
}

main();
