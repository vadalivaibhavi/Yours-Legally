"use server";
/**
 * Upload into a deal (FR-3): extract → propose a deal link tiered by certainty → (auto) link and
 * re-check, (ask) one question with options, (new) create a deal. The user's choice is final.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { allDeals, allDocuments, dealDocuments, getDeal } from "@/lib/deals";
import { proposeLink, type LinkProposal } from "@/lib/linking";
import { isQuotaExhausted } from "@/lib/llm";
import { extractReferences } from "@/lib/references";
import { extractDocument } from "@/lib/review/extract";
import { nextVersion, reviewDeal } from "@/lib/review/pipeline";
import { currentUser } from "@/lib/session";
import { mutate, readState } from "@/lib/store";
import { LIMITS } from "@/lib/limits";
import type { Deal, Document } from "@/lib/types";

export async function uploadDocument(form: FormData) {
  const user = await currentUser();
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  let name = "pasted-text.md";
  if (file && typeof file === "object" && "text" in file && (file as File).size > 0) {
    name = (file as File).name;
    if (!/\.(md|txt|markdown)$/i.test(name)) throw new Error("The prototype reads text (.md / .txt) contracts; PDF/OCR intake is declared out of scope.");
    if ((file as File).size > LIMITS.fileBytes) throw new Error(`That file is ${Math.round((file as File).size / 1024)} KB; the limit is ${LIMITS.fileBytes / 1_000_000} MB.`);
    text = await (file as File).text();
  }
  text = text.replace(/\r\n/g, "\n").trim();
  if (text.length < 200) throw new Error("That document is too short to review.");
  if (text.length > LIMITS.contract) throw new Error(`That contract is ${text.length.toLocaleString()} characters; the limit is ${LIMITS.contract.toLocaleString()}.`);
  const into = getDeal(String(form.get("deal") ?? ""));
  if (into && dealDocuments(into).some((d) => d.text.trim() === text)) redirect(`/deal/${into.id}?duplicate=1`);

  let x;
  try {
    x = await extractDocument({ id: "upload", file: name, kind: "uploaded", docType: "Other", title: name, counterparty: "", date: "", sideOfTable: "supplier", paper: "client", text, ocr: false, references: [] } as Document);
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    redirect(`/upload?quota=1${form.get("deal") ? `&deal=${encodeURIComponent(String(form.get("deal")))}` : ""}`); // nothing saved yet: upload again tomorrow
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
  const chosen = String(form.get("deal") ?? "");
  // A new version of a document already in the chosen deal takes its place; the old one leaves the deal.
  const replaced = chosen ? dealDocuments(getDeal(chosen)!).find((d) => d.id === String(form.get("replaces") ?? "")) : undefined;
  if (replaced) Object.assign(doc, { replaces: replaced.id, title: `${replaced.title.replace(/\s*\((draft|v\d+)[^)]*\)/i, "")} (revised, uploaded ${name})` });
  const proposal = proposeLink({ counterparty: doc.counterparty, docType: doc.docType, text, docId: id }, allDeals(), allDocuments(), chosen || undefined);
  mutate((s) => {
    s.uploadedDocuments.push(doc);
  }, { user: user.name, action: "upload", detail: { id, name, proposal: proposal.mode, dealId: proposal.dealId } });

  if (proposal.mode === "auto" || proposal.mode === "user") {
    await attach(doc, proposal.dealId!, proposal, user.name);
    return;
  }
  if (proposal.mode === "new") {
    await attach(doc, "new", proposal, user.name);
    return;
  }
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
  // New input → automatic re-check: a new brief version (FR-17).
  const version = nextVersion(target);
  let brief;
  try {
    brief = await reviewDeal(target, { trigger: `uploaded ${doc.file}`, version });
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    // The document stays attached; the deal is marked as needing a re-check once the quota resets.
    mutate((s) => void (s.dealOverrides[target] = { ...(s.dealOverrides[target] ?? {}), staleSince: new Date().toISOString() }));
    revalidatePath("/", "layout");
    redirect(`/deal/${target}?quota=1`);
  }
  if (proposal.note) brief.notSeen.unshift(proposal.note.text);
  mutate((s) => void (s.briefs[target] = [...(s.briefs[target] ?? []), brief]), { user: by, dealId: target, action: "brief.recheck", detail: { version } });
  revalidatePath("/", "layout");
  const u = await currentUser();
  redirect(u.role === "karandeep" ? `/deal/${target}?v=${version}&open=1#brief` : `/deal/${target}`);
}
