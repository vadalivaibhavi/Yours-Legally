"use server";
/**
 * Brief, decision and register actions (FR-12, FR-15, FR-17, FR-21, FR-2). Each one is recorded in
 * the audit log. Decision buttons record status only: nothing is ever sent, signed or emailed.
 * Server-side role checks back up proxy.ts (sellers can't call Karandeep-only actions).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canDecide, canViewDeal } from "@/lib/access";
import { allDeals, getDeal } from "@/lib/deals";
import { registerEntry } from "@/lib/register";
import { nextVersion, reviewDeal } from "@/lib/review/pipeline";
import { currentUser } from "@/lib/session";
import { runSellerCheck } from "@/lib/seller";
import { latestSellerCheck } from "@/lib/sellerChecks";
import { mutate, type SellerInput } from "@/lib/store";
import { field, LIMITS } from "@/lib/limits";

async function requireKarandeep() {
  const u = await currentUser();
  if (!canDecide(u)) throw new Error("Only Karandeep can do this.");
  return u;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const now = () => new Date().toISOString();

export async function reactToFinding(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const key = str(form, "key");
  const reaction = str(form, "reaction") as "agree" | "disagree" | "severity";
  const reason = field(form, "reason", LIMITS.name, "Reason");
  const isBlocker = str(form, "severity") === "blocker";
  // FR-12: disagreeing with a blocker needs a reason code.
  if (reaction === "disagree" && isBlocker && !reason) throw new Error("A reason is required to disagree with a blocker.");
  mutate(
    (s) => {
      s.reactions[dealId] ??= {};
      s.reactions[dealId][key] = { reaction, reason: reason || undefined, severity: str(form, "newSeverity") || undefined, note: field(form, "note", LIMITS.note, "Note") || undefined, at: now(), version: Number(str(form, "version")) };
    },
    { user: u.name, dealId, action: `finding.${reaction}`, detail: { key, reason, newSeverity: str(form, "newSeverity") } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
}

export async function undoReaction(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const key = str(form, "key");
  mutate((s) => void delete s.reactions[dealId]?.[key], { user: u.name, dealId, action: "finding.undo", detail: { key } });
  revalidatePath(`/deal/${dealId}`, "layout");
}

export async function acceptAllMedium(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const keys = str(form, "keys").split(",").filter(Boolean);
  mutate(
    (s) => {
      s.reactions[dealId] ??= {};
      for (const k of keys) s.reactions[dealId][k] ??= { reaction: "agree", at: now(), version: Number(str(form, "version")) };
    },
    { user: u.name, dealId, action: "finding.accept_all_medium", detail: { keys } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
}

export async function noteOnBlocker(form: FormData) {
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
}

export async function addMissed(form: FormData) {
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
}

export async function confirmFact(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const factId = str(form, "factId");
  const status = str(form, "status") as "confirmed" | "not_true" | "edited";
  mutate(
    (s) => {
      s.confirmations[dealId] ??= {};
      s.confirmations[dealId][factId] = { status, edit: field(form, "edit", LIMITS.note, "Correction") || undefined, at: now() };
    },
    { user: u.name, dealId, action: `fact.${status}`, detail: { factId, edit: str(form, "edit") } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
}

export async function closeAlert(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const how = str(form, "how") as "evidence" | "note" | "open";
  const note = field(form, "note", LIMITS.note, "Note");
  if (how !== "open" && !note) throw new Error("Add the evidence reference or your note.");
  mutate(
    (s) => {
      // FR-21: attested notes may close compliance events; they never clear contractual blockers.
      s.alerts[dealId] = how === "open" ? { status: "open", at: now() } : { status: "resolved", how, note: how === "note" ? note : undefined, evidence: how === "evidence" ? note : undefined, at: now() };
    },
    { user: u.name, dealId, action: `alert.${how}`, detail: { note } },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
}

export async function recordDecision(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const decision = str(form, "decision");
  mutate(
    (s) => {
      s.dealOverrides[dealId] = { ...(s.dealOverrides[dealId] ?? {}), decision, decidedAt: now(), status: decision === "Sign" || decision === "Reject" ? "decided" : undefined };
    },
    { user: u.name, dealId, action: "decision", detail: { decision, version: str(form, "version"), note: "recorded only: nothing sent, signed or shared" } },
  );
  revalidatePath("/", "layout");
}

export async function answerFollowUp(form: FormData) {
  const u = await requireKarandeep();
  const dealId = str(form, "dealId");
  const entry = { version: Number(str(form, "version")), answer: str(form, "answer"), reason: str(form, "reason") || undefined, at: now() };
  mutate(
    (s) => {
      s.followUps[dealId] ??= [];
      s.followUps[dealId].push(entry);
    },
    { user: u.name, dealId, action: "brief.followup", detail: entry },
  );
  revalidatePath(`/deal/${dealId}`, "layout");
}

/** FR-17 "Input added → re-check": new brief version grouped New / Still open / Resolved. */
export async function recheckDeal(form: FormData) {
  const u = await currentUser();
  const dealId = str(form, "dealId");
  const deal = getDeal(dealId);
  if (!deal || !canViewDeal(u, deal)) throw new Error("Not allowed");
  const version = nextVersion(dealId);
  const brief = await reviewDeal(dealId, { trigger: str(form, "trigger") || "input added → re-check", version });
  mutate(
    (s) => {
      s.briefs[dealId] = [...(s.briefs[dealId] ?? []), brief];
      if (s.dealOverrides[dealId]) s.dealOverrides[dealId].staleSince = undefined;
    },
    { user: u.name, dealId, action: "brief.recheck", detail: { version } },
  );
  revalidatePath("/", "layout");
  redirect(u.role === "karandeep" ? `/deal/${dealId}/brief/${version}` : `/deal/${dealId}`);
}

// ---------------------------------------------------------------- register (FR-2)
export async function registerAction(form: FormData) {
  const u = await requireKarandeep();
  const id = str(form, "id");
  const action = str(form, "action") as "verify" | "unverify" | "reject" | "restore" | "edit";
  const entry = registerEntry(id);
  if (!entry) throw new Error("Unknown register entry");
  const edits =
    action === "edit"
      ? {
          title: field(form, "title", LIMITS.name, "Title") || entry.title,
          summary: field(form, "summary", LIMITS.summary, "Summary") || entry.summary,
          end: str(form, "end") || entry.end,
          includesAffiliates: form.get("includesAffiliates") === "on",
        }
      : undefined;
  mutate(
    (s) => {
      const prev = s.registerOverrides[id] ?? { at: now(), by: u.name };
      s.registerOverrides[id] = {
        ...prev,
        at: now(),
        by: u.name,
        verified: action === "verify" || action === "edit" ? true : action === "unverify" ? false : prev.verified,
        rejected: action === "reject" ? true : action === "restore" ? false : prev.rejected,
        edits: edits ? { ...(prev.edits ?? {}), ...edits } : prev.edits,
      };
      s.registerRevision += 1;
      // Rejected or edited entries change what open deals rely on: flag them for re-check (FR-2, FR-19).
      if (action === "reject" || action === "edit" || action === "restore")
        for (const d of allDeals()) if (d.status !== "signed") s.dealOverrides[d.id] = { ...(s.dealOverrides[d.id] ?? {}), staleSince: now() };
    },
    { user: u.name, action: `register.${action}`, detail: { id, edits } },
  );
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- seller deal check (F7, FR-13)
export type DealCheckState = { error?: string; ok?: boolean };

const SECTOR_VALUES = new Set(["hospitality", "travel", "retail", "healthcare", "bfsi", "logistics", "manufacturing", "food", "technology", "data_platform", "other"]);

export async function runDealCheck(_prev: DealCheckState, form: FormData): Promise<DealCheckState> {
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

  const check = await runSellerCheck(dealId, u.name, input, latestSellerCheck(dealId));
  mutate(
    (s) => {
      s.sellerChecks[dealId] = [...(s.sellerChecks[dealId] ?? []), check];
    },
    { user: u.name, dealId, action: "seller.check", detail: { items: check.items.map((i) => `${i.item}: ${i.status}`) } },
  );
  revalidatePath(`/deal/${dealId}`);
  return { ok: true };
}
