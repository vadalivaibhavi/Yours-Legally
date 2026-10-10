"use server";
/**
 * Upload (FR-3).
 *  - From a deal page: detect what the file is by rules (lib/uploadDetect.ts, no model call), show it and
 *    let the uploader change it, and only then process it: notes are added to the deal's notes, a new
 *    version replaces the document it revises, anything else is added as a contract document.
 *  - From the general upload page: extract → propose a deal link tiered by certainty → (auto) link and
 *    re-check, (ask) one question with options, (new) create a deal. The user's choice is final.
 * Every processed upload re-checks the deal (a new brief version).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { allDeals, allDocuments, dealDocuments, dealNotes, getDeal, type DealView } from "@/lib/deals";
import { proposeLink, type LinkProposal } from "@/lib/linking";
import { isQuotaExhausted } from "@/lib/llm";
import { findPriorVersion, guessDocType, looksLikeNotes } from "@/lib/uploadDetect";
import { extractReferences } from "@/lib/references";
import { extractDocument } from "@/lib/review/extract";
import { nextVersion, reviewDeal } from "@/lib/review/pipeline";
import { currentUser } from "@/lib/session";
import { mutate, readState } from "@/lib/store";
import { LIMITS } from "@/lib/limits";
import type { Deal, Document } from "@/lib/types";

/** The uploaded file or pasted text, checked for type and size. */
async function readUpload(form: FormData): Promise<{ name: string; text: string }> {
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  let name = "pasted-text.md";
  if (file && typeof file === "object" && "text" in file && (file as File).size > 0) {
    name = (file as File).name;
    if (!/\.(md|txt|markdown)$/i.test(name)) throw new Error("The prototype reads text (.md / .txt) files; PDF/OCR intake is declared out of scope.");
    if ((file as File).size > LIMITS.fileBytes) throw new Error(`That file is ${Math.round((file as File).size / 1024)} KB; the limit is ${LIMITS.fileBytes / 1_000_000} MB.`);
    text = await (file as File).text();
  }
  text = text.replace(/\r\n/g, "\n").trim();
  if (text.length < 20) throw new Error("That file is empty or too short.");
  if (text.length > LIMITS.contract) throw new Error(`That file is ${text.length.toLocaleString()} characters; the limit is ${LIMITS.contract.toLocaleString()}.`);
  return { name, text };
}

/** What the file most likely is, with the reason shown to the uploader. */
function detect(text: string, deal: DealView): { what: string; why: string } {
  const n = looksLikeNotes(text);
  if (n.notes) return { what: "note", why: n.why };
  const v = findPriorVersion({ text, docType: guessDocType(text) }, dealDocuments(deal));
  if (v) return { what: `replace:${v.doc.id}`, why: v.why };
  return { what: "contract", why: `${n.why || "reads as a contract"}; it doesn't match a document already in this deal` };
}

export async function uploadDocument(form: FormData) {
  const user = await currentUser();
  const { name, text } = await readUpload(form);
  const deal = getDeal(String(form.get("deal") ?? ""));
  if (form.get("inDeal") === "1" && deal) {
    // Step 1 of 2: detect and hold it; nothing is processed until the uploader confirms what it is.
    if (dealDocuments(deal).some((d) => d.text.trim() === text) || dealNotes(deal).some((n) => n.text.trim() === text)) redirect(`/deal/${deal.id}?duplicate=1`);
    const id = `stage-${Date.now().toString(36)}`;
    const guess = detect(text, deal);
    mutate((s) => void (s.stagedUploads = [...s.stagedUploads.filter((x) => x.dealId !== deal.id), { id, dealId: deal.id, name, text, at: new Date().toISOString(), guess }]));
    redirect(`/upload?deal=${deal.id}&staged=${id}`);
  }
  await processContract({ name, text, chosen: String(form.get("deal") ?? ""), what: "contract", by: user.name });
}

/** Step 2 of 2: the uploader confirmed (or changed) what the file is. */
export async function confirmUpload(form: FormData) {
  const user = await currentUser();
  const staged = readState().stagedUploads.find((x) => x.id === String(form.get("staged")));
  if (!staged) throw new Error("That upload has expired: upload the file again.");
  const what = String(form.get("what") ?? staged.guess.what);
  mutate((s) => void (s.stagedUploads = s.stagedUploads.filter((x) => x.id !== staged.id)), {
    user: user.name,
    dealId: staged.dealId,
    action: "upload.confirm",
    detail: { name: staged.name, detected: staged.guess.what, chosen: what },
  });
  if (what === "note") return addNote(staged.dealId, staged.name, staged.text, user.name);
  await processContract({ name: staged.name, text: staged.text, chosen: staged.dealId, what, by: user.name });
}

/** A contract document: extract, link (or keep the chosen deal), replace the revised document if any, re-check. */
async function processContract(a: { name: string; text: string; chosen: string; what: string; by: string }) {
  const { name, text, chosen, what, by } = a;
  if (text.length < 200) throw new Error("That document is too short to review.");
  const into = getDeal(chosen);
  if (into && dealDocuments(into).some((d) => d.text.trim() === text)) redirect(`/deal/${into.id}?duplicate=1`);
  let x;
  try {
    x = await extractDocument({ id: "upload", file: name, kind: "uploaded", docType: "Other", title: name, counterparty: "", date: "", sideOfTable: "supplier", paper: "client", text, ocr: false, references: [] } as Document);
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    redirect(`/upload?quota=1${chosen ? `&deal=${encodeURIComponent(chosen)}` : ""}`); // nothing saved yet: upload again tomorrow
  }
  if (!x.ok) throw new Error("Couldn't read the document: review manually. " + x.error.slice(0, 120));
  const id = `up-${Date.now().toString(36)}`;
  const doc: Document = {
    id,
    file: name,
    kind: "uploaded",
    docType: x.data.docType,
    title: `${x.data.counterparty}: ${x.data.docType} (uploaded ${name})`,
    counterparty: x.data.counterparty,
    date: new Date().toISOString().slice(0, 10),
    atliqEntity: x.data.atliqEntityNamed.value ?? undefined,
    sideOfTable: x.data.sideOfTable,
    paper: x.data.paper,
    text,
    ocr: false,
    references: extractReferences(text),
  };
  // A new version of a document already in the deal takes its place; the old one leaves the deal.
  const replaced = into && what.startsWith("replace:") ? dealDocuments(into).find((d) => d.id === what.slice(8)) : undefined;
  if (replaced) Object.assign(doc, { replaces: replaced.id, title: `${replaced.title.replace(/\s*\((draft|v\d+)[^)]*\)/i, "")} (revised, uploaded ${name})` });
  const proposal = proposeLink({ counterparty: doc.counterparty, docType: doc.docType, text, docId: id }, allDeals(), allDocuments(), chosen || undefined);
  mutate((s) => void s.uploadedDocuments.push(doc), { user: by, action: "upload", detail: { id, name, proposal: proposal.mode, dealId: proposal.dealId, replaces: doc.replaces } });
  if (proposal.mode === "auto" || proposal.mode === "user") return attach(doc, proposal.dealId!, proposal, by);
  if (proposal.mode === "new") return attach(doc, "new", proposal, by);
  redirect(`/upload?pending=${id}`);
}

export async function chooseDeal(form: FormData) {
  const user = await currentUser();
  const docId = String(form.get("docId"));
  const dealId = String(form.get("dealId"));
  const doc = readState().uploadedDocuments.find((d) => d.id === docId);
  if (!doc) throw new Error("Upload not found");
  const proposal = proposeLink({ counterparty: doc.counterparty, docType: doc.docType, text: doc.text, docId }, allDeals(), allDocuments(), dealId);
  await attach(doc, dealId, proposal, user.name);
}

async function attach(doc: Document, dealId: string, proposal: LinkProposal, by: string) {
  let target = dealId;
  if (dealId === "new") {
    const deal: Deal = {
      id: `${doc.counterparty.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${Date.now().toString(36).slice(-4)}`,
      name: `${doc.counterparty}: ${doc.docType}`,
      counterparty: doc.counterparty,
      counterpartyAliases: [],
      owner: by,
      status: "open",
      documentIds: [doc.id],
      contextDocumentIds: [],
      noteIds: [],
      linkedDealIds: proposal.endClientDealId ? [proposal.endClientDealId] : [],
      endClientDealId: proposal.endClientDealId,
      trackerIds: [],
      trackerNotes: [],
    };
    target = deal.id;
    mutate((s) => void s.newDeals.push(deal), { user: by, dealId: deal.id, action: "deal.create", detail: { from: doc.id } });
  } else {
    if (!getDeal(dealId)) throw new Error("Unknown deal");
    mutate(
      (s) => {
        const o = (s.dealOverrides[dealId] ??= {});
        o.addDocumentIds = [...new Set([...(o.addDocumentIds ?? []), doc.id])];
        if (doc.replaces) o.removeDocumentIds = [...new Set([...(o.removeDocumentIds ?? []), doc.replaces])];
      },
      { user: by, dealId, action: "deal.link", detail: { docId: doc.id, mode: proposal.mode, reason: proposal.reason, replaces: doc.replaces } },
    );
  }
  mutate((s) => {
    s.linkChoices[doc.id] = { dealId: target, reason: `${proposal.mode}: ${proposal.reason}${proposal.note ? ` · note: ${proposal.note.text}` : ""}`, at: new Date().toISOString() };
  });
  await recheckAfterUpload(target, `uploaded ${doc.file}`, by, proposal.note?.text);
}

/** New input → automatic re-check: a new brief version (FR-17), then open it. */
async function recheckAfterUpload(target: string, trigger: string, by: string, notSeen?: string) {
  const version = nextVersion(target);
  let brief;
  try {
    brief = await reviewDeal(target, { trigger, version });
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    // The upload stays in the deal; the deal is marked as needing a Sync once the quota resets.
    mutate((s) => void (s.dealOverrides[target] = { ...(s.dealOverrides[target] ?? {}), staleSince: new Date().toISOString(), staleReason: "a new upload hasn't been reviewed yet (daily quota)" }));
    revalidatePath("/", "layout");
    redirect(`/deal/${target}?quota=1`);
  }
  if (notSeen) brief.notSeen.unshift(notSeen);
  mutate((s) => void (s.briefs[target] = [...(s.briefs[target] ?? []), brief]), { user: by, dealId: target, action: "brief.recheck", detail: { version } });
  revalidatePath("/", "layout");
  const u = await currentUser();
  redirect(u.role === "karandeep" ? `/deal/${target}?v=${version}&open=1#brief` : `/deal/${target}`);
}

/** Meeting notes, an email or an update: added to the deal's notes (no contract extraction), then the deal is re-checked so the notes scan reads it. */
async function addNote(dealId: string, name: string, text: string, by: string) {
  if (!getDeal(dealId)) throw new Error("Notes can only be uploaded from a deal's page.");
  const id = `note-up-${Date.now().toString(36)}`;
  const title = (text.split("\n").find((l) => l.trim())?.replace(/^[#*\s]+/, "").slice(0, 80) || name) + " (uploaded)";
  mutate(
    (s) => {
      s.uploadedNotes.push({ id, file: name, date: new Date().toISOString().slice(0, 10), title, text, dealIds: [dealId] });
      const o = (s.dealOverrides[dealId] ??= {});
      o.addNoteIds = [...new Set([...(o.addNoteIds ?? []), id])];
    },
    { user: by, dealId, action: "note.upload", detail: { id, name } },
  );
  await recheckAfterUpload(dealId, `notes uploaded: ${name}`, by);
}
