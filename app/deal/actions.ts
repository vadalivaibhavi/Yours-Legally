"use server";
/**
 * Brief, decision and register actions (FR-12, FR-15, FR-17, FR-21, FR-2). Each one is recorded in
 * the audit log. Decision buttons record status only: nothing is ever sent, signed or emailed.
 * Server-side role checks back up proxy.ts (sellers can't call Karandeep-only actions).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canDecide, canViewDeal } from "@/lib/access";
import { allDeals, dealDocuments, getDeal, SIGN_DECISIONS } from "@/lib/deals";
import { QUOTA_MESSAGE } from "@/lib/limits";
import { isQuotaExhausted } from "@/lib/llm";
import { registerEntry } from "@/lib/register";
import { applyRegisterChange, dealsAffectedBy, storeSignedDeal, type RegisterAction } from "@/lib/registerEdit";
import { AtliqEntity, Region, RegisterType, Sector, type RegisterEntry } from "@/lib/types";
import { extractCommitments } from "@/lib/registerExtract";
import { nextVersion, reviewDeal } from "@/lib/review/pipeline";
import { currentUser } from "@/lib/session";
import { runSellerCheck } from "@/lib/seller";
import { latestSellerCheck } from "@/lib/sellerChecks";
import { mutate, readState, type SellerInput, withState } from "@/lib/store";
import { reviewProgress } from "@/lib/review/progress";
import fs from "node:fs";
import path from "node:path";
import { writableDir } from "@/lib/config";
import { EVIDENCE_TYPES, field, LIMITS } from "@/lib/limits";

async function requireKarandeep() {
  const u = await currentUser();
  if (!canDecide(u)) throw new Error("Only Karandeep can do this.");
  return u;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const now = () => new Date().toISOString();

export async function reactToFinding(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const key = str(form, "key");
  const reaction = str(form, "reaction") as "agree" | "disagree" | "severity";
  const reason = field(form, "reason", LIMITS.name, "Reason");
  const isBlocker = str(form, "severity") === "blocker";
  // FR-12: disagreeing with a blocker needs a reason code.
  if (reaction === "disagree" && isBlocker && !reason) throw new Error("A reason is required to disagree with a blocker.");
  reopenIfFinalised(dealIdOf(form));
  mutate(
    (s) => {
      s.reactions[dealId] ??= {};
      s.reactions[dealId][key] = { reaction, reason: reason || undefined, severity: str(form, "newSeverity") || undefined, note: field(form, "note", LIMITS.note, "Note") || undefined, at: now(), version: Number(str(form, "version")) };
    },
    { user: u.name, dealId, action: `finding.${reaction}`, detail: { key, reason, newSeverity: str(form, "newSeverity") } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function undoReaction(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const key = str(form, "key");
  reopenIfFinalised(dealIdOf(form));
  mutate((s) => void delete s.reactions[dealId]?.[key], { user: u.name, dealId, action: "finding.undo", detail: { key } });
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function acceptAllMedium(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const keys = str(form, "keys").split(",").filter(Boolean);
  reopenIfFinalised(dealIdOf(form));
  mutate(
    (s) => {
      s.reactions[dealId] ??= {};
      for (const k of keys) s.reactions[dealId][k] ??= { reaction: "agree", at: now(), version: Number(str(form, "version")) };
    },
    { user: u.name, dealId, action: "finding.accept_all_medium", detail: { keys } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function noteOnBlocker(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const key = str(form, "key");
  const note = field(form, "note", LIMITS.note, "Note");
  if (!note) return;
  mutate(
    (s) => {
      s.blockerNotes[dealId] ??= {};
      s.blockerNotes[dealId][key] = { note, at: now() };
    },
    { user: u.name, dealId, action: "blocker.note", detail: { key, note } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function addMissed(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const entry = { clauseRef: field(form, "clauseRef", LIMITS.clauseRef, "Clause"), note: field(form, "note", LIMITS.note, "Note"), at: now(), version: Number(str(form, "version")) };
  if (!entry.note) return;
  mutate(
    (s) => {
      s.missed[dealId] ??= [];
      s.missed[dealId].push(entry);
    },
    { user: u.name, dealId, action: "brief.missed", detail: entry }, // FR-16: becomes an eval regression case
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function confirmFact(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const factId = str(form, "factId");
  const status = str(form, "status") as "confirmed" | "not_true" | "edited";
  reopenIfFinalised(dealIdOf(form));
  mutate(
    (s) => {
      s.confirmations[dealId] ??= {};
      s.confirmations[dealId][factId] = { status, edit: field(form, "edit", LIMITS.note, "Correction") || undefined, at: now() };
    },
    { user: u.name, dealId, action: `fact.${status}`, detail: { factId, edit: str(form, "edit") } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function closeAlert(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  // One "Resolve" control: an attached file makes it "resolved with evidence", text alone an attested note (FR-21).
  const requested = str(form, "how") as "resolve" | "evidence" | "note" | "open";
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  const how: "evidence" | "note" | "open" = requested === "open" ? "open" : requested === "resolve" ? (hasFile ? "evidence" : "note") : requested;
  const note = field(form, "note", LIMITS.note, "Note");
  let evidenceFile: { name: string; stored: string; bytes: number } | undefined;
  if (how === "evidence" && hasFile) {
    const ext = path.extname(file.name).toLowerCase();
    if (!EVIDENCE_TYPES.includes(ext)) throw new Error(`Evidence files can be ${EVIDENCE_TYPES.join(", ")}.`);
    if (file.size > LIMITS.evidenceBytes) throw new Error(`That file is ${Math.round(file.size / 1024)} KB; the limit is ${LIMITS.evidenceBytes / 1_000_000} MB.`);
    const name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, LIMITS.name);
    const stored = `${dealId}-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(writableDir("evidence"), stored), Buffer.from(await file.arrayBuffer()));
    evidenceFile = { name, stored, bytes: file.size };
  }
  if (how !== "open" && !note && !evidenceFile) throw new Error("Add the evidence (a reference or a file) or your note.");
  mutate(
    (s) => {
      // FR-21: attested notes may close compliance events; they never clear contractual blockers.
      s.alerts[dealId] =
        how === "open"
          ? { status: "open", at: now() }
          : { status: "resolved", how, note: how === "note" ? note : undefined, evidence: how === "evidence" ? note || undefined : undefined, evidenceFile, at: now() };
    },
    { user: u.name, dealId, action: `alert.${how}`, detail: { note, file: evidenceFile?.name } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function recordDecision(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const decision = str(form, "decision");
  mutate(
    (s) => {
      // A chosen decision is a draft until the review is finalised (all items answered).
      s.dealOverrides[dealId] = { ...(s.dealOverrides[dealId] ?? {}), decision, decidedAt: now(), finalised: false, finalisedAt: undefined, status: undefined };
    },
    { user: u.name, dealId, action: "decision", detail: { decision, version: str(form, "version"), note: "recorded only: nothing sent, signed or shared" } },
  );
  revalidatePath("/", "layout");
  });
}

export async function answerFollowUp(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const entry = {
    version: Number(str(form, "version")),
    answer: str(form, "answer"),
    reason: field(form, "reason", LIMITS.name, "Reason") || undefined,
    note: field(form, "note", LIMITS.note, "Note") || undefined,
    at: now(),
  };
  mutate(
    (s) => {
      // One answer per brief version: a new answer replaces the old one.
      s.followUps[dealId] = [...(s.followUps[dealId] ?? []).filter((x) => x.version !== entry.version), entry];
    },
    { user: u.name, dealId, action: "brief.followup", detail: entry },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

/** FR-17 "Input added → re-check": new brief version grouped New / Still open / Resolved. */
export async function recheckDeal(form: FormData) {
  return withState(async () => {
  const u = await currentUser();
  const dealId = str(form, "dealId");
  const deal = getDeal(dealId);
  if (!deal || !canViewDeal(u, deal)) throw new Error("Not allowed");
  const version = nextVersion(dealId);
  let brief;
  try {
    brief = await reviewDeal(dealId, { trigger: str(form, "trigger") || "input added → re-check", version });
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    redirect(`/deal/${dealId}?quota=1`); // no partial brief: re-check again after the reset
  }
  mutate(
    (s) => {
      s.briefs[dealId] = [...(s.briefs[dealId] ?? []), brief];
      if (s.dealOverrides[dealId]) Object.assign(s.dealOverrides[dealId], { staleSince: undefined, staleReason: undefined });
    },
    { user: u.name, dealId, action: "brief.recheck", detail: { version } },
  );
  revalidatePath("/", "layout");
  redirect(u.role === "karandeep" ? `/deal/${dealId}?v=${version}&open=1#brief` : `/deal/${dealId}`);
  });
}

// ---------------------------------------------------------------- register (FR-2)
export async function registerAction(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const id = str(form, "id");
  const action = str(form, "action") as RegisterAction;
  const entry = registerEntry(id);
  if (!entry) throw new Error("Unknown register entry");
  applyRegisterChange(id, action, action === "edit" ? registerEdits(form, entry) : undefined, u.name);
  revalidatePath("/", "layout");
  });
}

/** The whole entry as edited on the Register screen (the source clause and its quote stay verbatim). */
function registerEdits(form: FormData, e: RegisterEntry): Partial<RegisterEntry> {
  const pick = <T extends string>(name: string, allowed: readonly T[]) => form.getAll(name).map(String).filter((x): x is T => (allowed as readonly string[]).includes(x));
  const list = (name: string, label: string) =>
    field(form, name, LIMITS.summary, label)
      .split(",")
      .map((x) => x.trim().slice(0, LIMITS.name))
      .filter(Boolean)
      .slice(0, 20);
  const date = (name: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(form, name)) ? str(form, name) : null);
  const type = str(form, "type");
  const perpetual = form.get("perpetual") === "on";
  return {
    title: field(form, "title", LIMITS.name, "Title") || e.title,
    summary: field(form, "summary", LIMITS.summary, "Summary") || e.summary,
    type: (RegisterType.options as string[]).includes(type) ? (type as RegisterEntry["type"]) : e.type,
    bindsEntities: pick("binds", AtliqEntity.options),
    includesAffiliates: form.get("includesAffiliates") === "on",
    routine: form.get("routine") === "on",
    scope: {
      sectors: pick("sectors", Sector.options),
      regions: pick("regions", Region.options),
      services: list("services", "Services"),
      assets: list("assets", "Tools / IP"),
      counterparties: list("counterparties", "Limited to"),
    },
    start: date("start") ?? e.start,
    perpetual,
    end: perpetual ? null : date("end"),
    // The extracted end rule ("Term + 18 months") describes the old dates: drop it once the dates are edited,
    // so the checks, the model prompt and the card all use the corrected end.
    endRule: perpetual === e.perpetual && (perpetual ? null : date("end")) === e.end ? e.endRule : null,
  };
}

// ---------------------------------------------------------------- seller deal check (F7, FR-13)
export type DealCheckState = { error?: string; ok?: boolean };

const SECTOR_VALUES = new Set(["hospitality", "travel", "retail", "healthcare", "bfsi", "logistics", "manufacturing", "food", "technology", "data_platform", "other"]);

export async function runDealCheck(_prev: DealCheckState, form: FormData): Promise<DealCheckState> {
  return withState(async () => {
  const u = await currentUser();
  const dealId = str(form, "dealId");
  const deal = getDeal(dealId);
  if (!deal || !canViewDeal(u, deal)) return { error: "You can only check your own deals." };
  let input: SellerInput;
  try {
    const list = (k: string, label: string) => field(form, k, LIMITS.list, label).split(",").map((x) => x.trim()).filter(Boolean);
    const rates = field(form, "rates", LIMITS.rates, "Rates")
      .split(/\n|;/)
      .map((l) => l.match(/^(.+?)[\s:@-]+\$?(\d+(?:\.\d+)?)/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ role: m[1].trim().slice(0, LIMITS.name), ratePerHourUsd: Number(m[2]) }));
    input = {
      client: field(form, "client", LIMITS.name, "Client"),
      sectors: form.getAll("sectors").map(String).filter((s) => SECTOR_VALUES.has(s)),
      regions: list("regions", "Regions / sites"),
      services: list("services", "Services"),
      rates,
      assets: list("assets", "Tools / IP"),
      dataHandling: field(form, "dataHandling", LIMITS.note, "Data handling"),
      partnership: form.get("partnership") === "on",
      freeText: field(form, "freeText", LIMITS.freeText, "Anything else"),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
  // Never evaluate an empty plan: no green answer without the main details (FR-13, "silence is never safe").
  const missing = [!input.client && "client", !input.sectors.length && "client sector", !input.regions.length && "regions / sites", !input.services.length && "services"].filter(Boolean);
  if (missing.length) return { error: `The main details are missing (${missing.join(", ")}), so AtliQ's commitments can't be checked against this deal yet. Fill them in and check again.` };
  if (str(form, "rates") && !input.rates.length) return { error: 'Rates couldn\'t be read. Use one per line, e.g. "Senior Data Engineer $72".' };

  let check;
  try {
    check = await runSellerCheck(dealId, u.name, input, latestSellerCheck(dealId));
  } catch (e) {
    if (isQuotaExhausted(e)) return { error: QUOTA_MESSAGE };
    throw e;
  }
  mutate(
    (s) => {
      s.sellerChecks[dealId] = [...(s.sellerChecks[dealId] ?? []), check];
    },
    { user: u.name, dealId, action: "seller.check", detail: { items: check.items.map((i) => `${i.item}: ${i.status}`) } },
  );
  revalidatePath(`/deal/${dealId}`);
  return { ok: true };
  });
}

// ---------------------------------------------------------------- undo (every choice in the brief can be changed)
export async function undoConfirmation(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const factId = str(form, "factId");
  reopenIfFinalised(dealIdOf(form));
  mutate((s) => void delete s.confirmations[dealId]?.[factId], { user: u.name, dealId, action: "fact.undo", detail: { factId } });
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function undoFollowUp(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const version = Number(str(form, "version"));
  mutate((s) => void (s.followUps[dealId] = (s.followUps[dealId] ?? []).filter((x) => x.version !== version)), { user: u.name, dealId, action: "brief.followup.undo", detail: { version } });
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function removeMissed(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const at = str(form, "at");
  mutate((s) => void (s.missed[dealId] = (s.missed[dealId] ?? []).filter((m) => m.at !== at)), { user: u.name, dealId, action: "brief.missed.remove", detail: { at } });
  revalidatePath(`/deal/${dealId}`, "layout");
  });
}

export async function clearDecision(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  mutate(
    (s) => {
      const o = s.dealOverrides[dealId];
      if (o) {
        o.decision = undefined;
        o.decidedAt = undefined;
        o.finalised = false;
        o.finalisedAt = undefined;
        o.status = undefined;
      }
    },
    { user: u.name, dealId, action: "decision.clear" },
  );
  revalidatePath("/", "layout");
  });
}

// ---------------------------------------------------------------- finalise (two-step: answer everything, then finalise)
const dealIdOf = (form: FormData) => String(form.get("dealId") ?? "");

/** Any change to an answered item after finalising puts the deal back "in review" until finalised again. */
function reopenIfFinalised(dealId: string) {
  const o = readState().dealOverrides[dealId];
  if (o?.finalised) mutate((s) => void Object.assign(s.dealOverrides[dealId], { finalised: false, finalisedAt: undefined, status: undefined }), { user: "Karandeep", dealId, action: "review.reopened" });
}

export async function finaliseReview(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const p = reviewProgress(dealId);
  if (!p) throw new Error("No brief to finalise");
  if (!p.complete) throw new Error(`Not ready to finalise: ${p.missing.join(", ")}.`);
  mutate(
    (s) => {
      s.dealOverrides[dealId] = { ...(s.dealOverrides[dealId] ?? {}), finalised: true, finalisedAt: now(), status: "decided" };
    },
    { user: u.name, dealId, action: "review.finalised", detail: { decision: p.decision, reacted: p.reacted, total: p.total } },
  );
  revalidatePath("/", "layout");
  });
}

export async function reopenReview(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  mutate((s) => void Object.assign(s.dealOverrides[dealId] ?? (s.dealOverrides[dealId] = {}), { finalised: false, finalisedAt: undefined, status: undefined }), { user: u.name, dealId, action: "review.reopened" });
  revalidatePath("/", "layout");
  });
}

// ---------------------------------------------------------------- store a signed deal in the contract register (FR-1)
/**
 * Karandeep decided to sign: the deal's contract text goes into the commitments register (same extractor
 * as the original signed set, entries unverified until he verifies them) and the deal leaves the queue.
 * Nothing changes unless every document was read: a failed or quota-stopped call keeps the deal in the queue.
 */
export async function storeInRegister(form: FormData) {
  return withState(async () => {
  const u = await requireKarandeep();
  const deal = getDeal(str(form, "dealId"));
  if (!deal || !SIGN_DECISIONS.includes(deal.decision ?? "")) throw new Error("Only a deal Karandeep decided to sign can be stored");
  const docs = dealDocuments(deal).filter((d, i, all) => all.findIndex((x) => x.text.trim() === d.text.trim()) === i);
  let results: { doc: (typeof docs)[number]; r: Awaited<ReturnType<typeof extractCommitments>> }[];
  try {
    results = [];
    for (const doc of docs) results.push({ doc, r: await extractCommitments(doc) }); // one at a time (free tier)
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    redirect(`/?storeFailed=${deal.id}&quota=1`);
  }
  if (results.some((x) => !x.r.ok)) redirect(`/?storeFailed=${deal.id}`);
  const ok = results.flatMap((x) => (x.r.ok ? [{ doc: x.doc, ...x.r }] : []));
  const { entries: added } = storeSignedDeal(
    deal.id,
    docs.map((d) => d.id),
    ok.map((x) => ({ docId: x.doc.id, counterparty: x.doc.counterparty, entries: x.entries, illegible: x.ex.illegible, referencedButMissing: x.ex.referencedButMissing })),
    u.name,
  );
  revalidatePath("/", "layout");
  redirect(`/?stored=${deal.id}&n=${added}`);
  });
}

/**
 * Undo an upload (Karandeep): the uploaded document leaves the deal, the brief versions that included it are
 * removed (the deal goes back to its brief from before the upload), and a version it replaced is restored.
 * Only uploaded documents can be removed; the dataset's own documents stay. Logged in the audit trail.
 */
export async function removeUpload(form: FormData) {
  return withState(async () => {
    const u = await requireKarandeep();
    const dealId = str(form, "dealId");
    const docId = str(form, "docId");
    const doc = readState().uploadedDocuments.find((d) => d.id === docId);
    if (!doc) throw new Error("Only an uploaded document can be removed.");
    mutate(
      (s) => {
        s.uploadedDocuments = s.uploadedDocuments.filter((d) => d.id !== docId);
        const o = s.dealOverrides[dealId];
        if (o) {
          o.addDocumentIds = (o.addDocumentIds ?? []).filter((x) => x !== docId);
          if (doc.replaces) o.removeDocumentIds = (o.removeDocumentIds ?? []).filter((x) => x !== doc.replaces);
          o.staleSince = undefined;
          o.staleReason = undefined;
        }
        s.briefs[dealId] = (s.briefs[dealId] ?? []).filter((b) => !b.documentIds.includes(docId));
      },
      { user: u.name, dealId, action: "upload.remove", detail: { docId, title: doc.title, restored: doc.replaces ?? null } },
    );
    revalidatePath("/", "layout");
    redirect(`/deal/${dealId}?removed=1`);
  });
}
