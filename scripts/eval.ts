/**
 * npm run eval: runs every case in eval/cases.json (from docs/Eval_Set.md) and writes eval/results.md.
 * Briefs come from data/briefs (npm run review); version pairs re-run the pipeline (cached per call).
 * Evals use an in-memory state so they never touch the app's real state file.
 *   npm run eval                      → all cases
 *   npm run eval -- --case EV-10      → one case (repeatable / comma list); results merge into the last full run
 *   npm run eval -- --deal kriti      → the cases about one deal
 *   npm run eval -- --no-versions     → skip EV-V (no model calls at all)
 * Cases run one at a time. A case stopped by the daily quota, or graded on a brief whose steps hit a rate
 * limit, is reported "not run (quota)", never "failed": quota is not a logic failure. Re-run tomorrow.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { checkIds, parseArgs } from "./_args";
import { checkRegister } from "./checkRegister";
import { filterRegister, unconfirmed } from "../lib/review/conflict";
import { oneWayNda } from "../lib/review/playbook";
import { briefsDir } from "../lib/config";
import {
  canDecide,
  canViewBrief,
  canViewDeal,
  canViewRegister,
  canViewSimilarClauses,
} from "../lib/access";
import { splitSections } from "../lib/chunker";
import { loadIndex, searchMany } from "../lib/clauseIndex";
import { readJson } from "../lib/config";
import { baseDeals, baseDocuments } from "../lib/data";
import { briefVersions } from "../lib/deals";
import { proposeLink } from "../lib/linking";
import { isQuotaExhausted, modelsFor, provider, withRunContext } from "../lib/llm";
import { locateQuote } from "../lib/quotes";
import { effectiveBrief } from "../lib/review/effective";
import { hasLegalConclusion } from "../lib/review/guardrails";
import { reviewDeal } from "../lib/review/pipeline";
import type { Brief, EffectiveBrief, Finding } from "../lib/review/types";
import { SEVERITY_RANK } from "../lib/review/types";
import { runSellerCheck, sellerBanner } from "../lib/seller";
import { registerEntries } from "../lib/register";
import { applyRegisterChange } from "../lib/registerEdit";
import {
  mutate,
  readState,
  useMemoryState,
  type SellerInput,
} from "../lib/store";
import type {
  ClauseType,
  Document,
  EvalCase,
  RegisterEntry,
} from "../lib/types";
import { USERS } from "../lib/users";

type Spec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Status = "pass" | "fail" | "skip" | "quota";
type Result = {
  id: string;
  section: string;
  title: string;
  pass: boolean | null;
  status: Status;
  detail: string;
};
type Case = EvalCase & { spec: Spec };

const results: Result[] = [];
const allCases = readJson<{ cases: Case[] }>("../eval/cases.json").cases;
const docs = baseDocuments();
const deals = baseDeals();
const args = parseArgs();
const noVersions = args.flags.has("no-versions");
// The final (Gemini) report is eval/results.*; a local run writes its own (eval/results-ollama.*) so it never overwrites it.
const RESULTS = (process.env.LLM_PROVIDER || "gemini").toLowerCase() === "gemini" ? "results" : `results-${(process.env.LLM_PROVIDER || "").toLowerCase()}`;
checkIds(
  "case",
  args.cases,
  allCases.map((c) => c.id),
);
const dealFilter = [...args.deals, ...args.positional];
checkIds(
  "deal",
  dealFilter,
  deals.map((d) => d.id),
);
const filtered = !!(args.cases.length || dealFilter.length);

/** The deal a case is about (for --deal): its dealId, or the deal holding its document. */
function caseDeal(c: Case): string | undefined {
  const docId = c.spec.docId ?? c.spec.query?.docId;
  return (
    c.spec.dealId ??
    deals.find((d) => docId && d.documentIds.includes(docId))?.id
  );
}
const cases = allCases.filter(
  (c) =>
    (!args.cases.length || args.cases.includes(c.id)) &&
    (!dealFilter.length || dealFilter.includes(caseDeal(c) ?? "")) &&
    // A filtered --no-versions run leaves the EV-V results of the last full run alone.
    !(filtered && noVersions && c.spec.kind === "version"),
);

const LABEL: Record<Status, string> = {
  pass: "PASS",
  fail: "FAIL",
  skip: "SKIP",
  quota: "QUOTA",
};
function record(
  c: EvalCase,
  pass: boolean | null,
  detail: string,
  status?: Status,
) {
  const st: Status =
    status ?? (pass === null ? "skip" : pass ? "pass" : "fail");
  results.push({
    id: c.id,
    section: c.section,
    title: c.title,
    pass: st === "quota" ? null : pass,
    status: st,
    detail,
  });
  console.log(`${LABEL[st].padEnd(5)} ${c.id.padEnd(6)} ${detail}`);
}

/** A step that hit a rate limit / quota: grading it would report quota as a logic failure. */
const QUOTA_ERROR = /quota|RESOURCE_EXHAUSTED|\b429\b|rate.?limit/i;
const hitQuota = (b: Brief) => b.errors.some((e) => QUOTA_ERROR.test(e));

/** Run one model-calling case: stamped in the call log, and a daily-quota stop becomes "not run (quota)". */
async function guarded(c: Case, fn: () => Promise<void>) {
  try {
    await withRunContext(
      { script: "eval", dealId: caseDeal(c), caseId: c.id },
      fn,
    );
  } catch (e) {
    if (!isQuotaExhausted(e)) throw e;
    record(c, null, `not run (quota): ${e.message}`, "quota");
  }
}

function v1(dealId: string): Brief | null {
  const p = path.join("data", briefsDir(), `${dealId}.json`);
  return fs.existsSync(p)
    ? (JSON.parse(fs.readFileSync(p, "utf8")) as Brief)
    : null;
}

function matches(f: Finding, pattern: string): boolean {
  if (pattern.startsWith("severity:")) return f.severity === pattern.slice(9);
  const [key, clause] = pattern.split("@");
  if (!f.key.startsWith(key)) return false;
  return (
    !clause ||
    f.citations.some(
      (c) => c.role === "incoming" && c.clauseRef.includes(clause),
    )
  );
}

function checkFindings(b: EffectiveBrief, spec: Spec): string[] {
  const problems: string[] = [];
  for (const p of spec.mustFind ?? [])
    if (!b.findings.some((f) => matches(f, p))) problems.push(`missing ${p}`);
  for (const p of spec.mustNotFlag ?? []) {
    const hit = b.findings.find(
      (f) => matches(f, p) && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium,
    );
    if (hit) problems.push(`flagged ${hit.key} (${hit.severity})`);
  }
  if (spec.maxMedium !== undefined) {
    const m = b.findings.filter((f) => f.severity === "medium").length;
    if (m > spec.maxMedium)
      problems.push(`${m} medium items > ${spec.maxMedium}`);
  }
  if (spec.expectRoute && b.route !== spec.expectRoute)
    problems.push(`route ${b.route}`);
  return problems;
}

function confirmAllCompliance(b: Brief) {
  if (!b.complianceCandidate) return;
  mutate((s) => {
    s.confirmations[b.dealId] = Object.fromEntries(
      b.complianceCandidate!.factIds.map((id) => [
        id,
        { status: "confirmed" as const, at: new Date().toISOString() },
      ]),
    );
  });
}

function syntheticDoc(
  file: string,
  meta: Partial<Document> &
    Pick<Document, "id" | "docType" | "counterparty" | "sideOfTable" | "paper">,
): Document {
  const text = fs
    .readFileSync(path.join("data", file), "utf8")
    .replace(/\r\n/g, "\n");
  // The synthetic text must win over any text carried in the metadata (e.g. the original v1 document).
  return {
    kind: "uploaded",
    title: meta.title ?? meta.id,
    date: "2026-10-04",
    ocr: false,
    references: [],
    ...meta,
    file,
    text,
  } as Document;
}

async function main() {
  // ---------------------------------------------------------------- A. register
  const reg = checkRegister(false);
  const row = (k: string) => reg.rows.find((r) => r.key === k);
  for (const c of cases.filter((c) => c.spec.kind === "register")) {
    const keys: string[] = c.spec.registerKeys;
    const bad = keys.filter(
      (k) => !row(k)?.matched || row(k)!.mismatches.length,
    );
    const ill = (c.spec.illegible ?? []).filter(
      (x: string) =>
        !reg.illegibleOk.find((i) => `${i.sourceDocId}:${i.clause}` === x)
          ?.found,
    );
    record(
      c,
      !bad.length && !ill.length,
      bad.length || ill.length
        ? `problems: ${[...bad.map((k) => `${k}: ${row(k)?.mismatches.join("; ") || "missing"}`), ...ill].join(" | ")}`
        : `${keys.join(", ")} present with quote + clause${ill.length === 0 && c.spec.illegible ? "; illegible clause reported" : ""}`,
    );
  }
  const index = loadIndex();
  for (const c of cases.filter((c) => c.spec.kind === "labels")) {
    const bad = (
      c.spec.expectedPrecedents as { docId: string; label: string }[]
    ).filter(
      (p) => !index.some((x) => x.docId === p.docId && x.label === p.label),
    );
    const asStandard = index.filter(
      (x) =>
        ["brightwater-msa", "meridian-nda"].includes(x.docId) &&
        x.label === "standard",
    );
    record(
      c,
      !bad.length && !asStandard.length,
      bad.length
        ? `labels missing: ${bad.map((b) => b.docId).join(", ")}`
        : "Brightwater=accident, Al Noor 10%=exception, Northwind law=concession, Meridian=accident; none labelled standard",
    );
  }

  // ---------------------------------------------------------------- B. incoming contracts
  for (const c of cases.filter((c) => c.spec.kind === "review")) {
    useMemoryState();
    const b = v1(c.spec.dealId);
    if (!b) {
      record(
        c,
        null,
        `not run: no brief for ${c.spec.dealId} yet (npm run review -- --deal ${c.spec.dealId})`,
      );
      continue;
    }
    if (c.spec.expectComplianceAlert) confirmAllCompliance(b);
    const e = effectiveBrief(b, null);
    const problems = checkFindings(e, c.spec);
    if (c.spec.expectedVerdict && e.verdict !== c.spec.expectedVerdict)
      problems.unshift(`verdict ${e.verdict} ≠ ${c.spec.expectedVerdict}`);
    if (c.spec.expectComplianceAlert && e.complianceAlert?.status !== "open")
      problems.push("no compliance alert");
    if (problems.length && hitQuota(b)) {
      record(
        c,
        null,
        `not run (quota): the brief's steps hit a rate limit (${problems.join("; ")}); re-run npm run review -- --deal ${b.dealId} --force`,
        "quota",
      );
      continue;
    }
    record(
      c,
      !problems.length,
      problems.length
        ? problems.join("; ")
        : `${e.verdict}${e.complianceAlert ? " + compliance alert" : ""} · found ${(c.spec.mustFind ?? []).join(", ") || "nothing to find"}${c.spec.mustNotFlag?.length ? " · clean on " + c.spec.mustNotFlag.join(", ") : ""}`,
    );
  }
  for (const c of cases.filter((c) => c.spec.kind === "unverified")) {
    useMemoryState();
    const b = v1(c.spec.dealId)!;
    const before = effectiveBrief(b, null).findings.find((f) =>
      f.key.startsWith(c.spec.mustFind[0]),
    );
    mutate((s) => {
      if (before?.registerEntryId)
        s.registerOverrides[before.registerEntryId] = {
          verified: true,
          at: new Date().toISOString(),
          by: "eval",
        };
    });
    const after = effectiveBrief(b, null).findings.find((f) =>
      f.key.startsWith(c.spec.mustFind[0]),
    );
    record(
      c,
      !!before &&
        before.registerVerified === false &&
        after?.registerVerified === true,
      before
        ? `raised while unverified (labelled), label removed after verify (${before.registerEntryId})`
        : "conflict not raised",
    );
  }

  // ---------------------------------------------------------------- B1. compliance alerts & notes
  for (const c of cases.filter((c) => c.spec.kind === "compliance")) {
    useMemoryState();
    const b = v1(c.spec.dealId)!;
    if (c.id === "EV-C1") {
      confirmAllCompliance(b);
      const open = effectiveBrief(b, null);
      mutate((s) => {
        s.alerts[b.dealId] = {
          status: "resolved",
          how: "note",
          note: "Harrington privacy officer confirmed deletion, 5 Oct",
          at: "2026-10-05T10:00:00.000Z",
        };
      });
      const closed = effectiveBrief(b, null);
      const ok =
        open.complianceAlert?.status === "open" &&
        closed.complianceAlert?.status === "resolved" &&
        /resolved by Karandeep's note/i.test(
          closed.complianceAlert?.resolution ?? "",
        ) &&
        closed.findings.length === open.findings.length;
      record(
        c,
        ok,
        ok
          ? `alert open → "${closed.complianceAlert?.resolution}"; findings unchanged (${closed.findings.length}); verdict ${closed.verdict} from the other open items`
          : `alert states ${open.complianceAlert?.status} → ${closed.complianceAlert?.status}`,
      );
    } else {
      const key = effectiveBrief(b, null).findings.find((f) =>
        f.key.startsWith("conflict:alnoor-msa"),
      )?.key;
      mutate((s) => {
        if (key)
          s.blockerNotes[b.dealId] = {
            [key]: {
              note: "Al Noor agreed verbally to waive for Gulf Crown",
              at: new Date().toISOString(),
            },
          };
      });
      const e = effectiveBrief(b, null);
      const f = e.findings.find((x) => x.key === key);
      const ok =
        !!f &&
        f.severity === "blocker" &&
        !!f.pendingDocument &&
        e.verdict === "HOLD";
      record(
        c,
        ok,
        ok
          ? `blocker stays open, "pending ${f!.pendingDocument}"; verdict HOLD`
          : "note cleared or changed the blocker",
      );
    }
  }

  // ---------------------------------------------------------------- B2. deal linking
  for (const c of cases.filter((c) => c.spec.kind === "linking")) {
    const d = c.spec.docId ? docs.find((x) => x.id === c.spec.docId)! : null;
    const input = d
      ? {
          counterparty: d.counterparty,
          docType: d.docType,
          text: d.text,
          docId: d.id,
        }
      : { ...c.spec.synthetic, docId: undefined };
    const p = proposeLink(input, deals, docs, c.spec.userChoice);
    const ex = c.spec.expect;
    const ok =
      p.mode === ex.mode &&
      (!ex.dealId || p.dealId === ex.dealId) &&
      (!ex.endClientDealId || p.endClientDealId === ex.endClientDealId) &&
      (!ex.notVersionOf ||
        ex.notVersionOf.every((x: string) => p.notVersionOf.includes(x))) &&
      (!ex.note || p.note?.dealId === ex.note);
    record(
      c,
      ok,
      `${p.mode}${p.dealId ? ` → ${p.dealId}` : ""} (${p.reason})${p.endClientDealId ? ` · end client ${p.endClientDealId}` : ""}${p.note ? ` · note: ${p.note.text}` : ""}${p.options.length ? ` · options: ${p.options.map((o) => o.dealId).join("/")}` : ""}`,
    );
  }

  // ---------------------------------------------------------------- B3. access control
  // One shared Seller role (product decision, 5 Oct): sellers see every deal's seller side, never Karandeep's views.
  const seller = USERS.find((u) => u.role === "seller")!;
  const k = USERS.find((u) => u.id === "karandeep")!;
  for (const c of cases.filter((c) => c.spec.kind === "access")) {
    if (c.id === "EV-A1") {
      const ok =
        deals.every((d) => canViewDeal(seller, d)) &&
        !canViewBrief(seller) &&
        !canViewRegister(seller) &&
        !canViewSimilarClauses(seller) &&
        !canDecide(seller) &&
        canViewBrief(k) &&
        canViewRegister(k);
      record(
        c,
        ok,
        "Seller opens any deal (deal check, queue, banners); brief, register, similar clauses and decisions are Karandeep-only (also enforced by proxy.ts + server checks)",
      );
    } else if (c.id === "EV-A2") {
      useMemoryState();
      await guarded(c, async () => {
        const chk = await runSellerCheck(
          "lakeshore",
          "Seller",
          sellerInput({
            client: "US retail client",
            sectors: ["retail"],
            regions: ["USA"],
            services: ["data engineering"],
            rates: [{ role: "Senior Data Engineer", ratePerHourUsd: 72 }],
          }),
        );
        const text = JSON.stringify(chk.items);
        const leak = ["Crestline", "$85", "85/hr", "85.00"].filter((w) =>
          text.includes(w),
        );
        record(
          c,
          chk.items.some((i) => i.status === "conflict") && !leak.length,
          leak.length
            ? `leaks ${leak.join(", ")}`
            : "says a pricing floor applies; no client name or rates revealed",
        );
      });
    } else {
      // EV-A3 ("seller can't open another seller's deal") no longer applies: there is one shared seller role.
      // What still must hold: no seller can reach another client's terms through Karandeep's views.
      const ok =
        deals.every((d) => !canViewBrief(seller) && canViewDeal(seller, d)) &&
        !canViewRegister(seller);
      record(
        c,
        ok,
        "Superseded by the single Seller role: sellers see all deals' seller side; briefs and the register (other clients' terms) stay Karandeep-only",
      );
    }
  }

  // ---------------------------------------------------------------- C. version pairs
  for (const c of cases.filter(
    (c) => c.spec.kind === "version" || c.spec.kind === "skip",
  )) {
    if (c.spec.kind === "skip") {
      record(c, null, c.spec.reason);
      continue;
    }
    if (noVersions) {
      record(c, null, "skipped (--no-versions)");
      continue;
    }
    useMemoryState();
    await guarded(c, async () => {
      const base = v1(c.spec.dealId)!;
      const replace: Record<string, Document> = {};
      for (const [id, file] of Object.entries(c.spec.replace ?? {})) {
        const orig = docs.find((d) => d.id === id)!;
        replace[id] = {
          ...syntheticDoc(file as string, orig),
          id,
          kind: "incoming",
          title: orig.title + " (v2)",
        };
      }
      const add = (c.spec.add ?? []).map((file: string) =>
        file.includes("rheinwerk")
          ? syntheticDoc(file, {
              id: "rheinwerk-annex3",
              title: "Rheinwerk Annex 3: Data Processing Agreement (synthetic)",
              docType: "DPA",
              counterparty: "Rheinwerk Analytics GmbH",
              atliqEntity: "Pvt Ltd",
              sideOfTable: "supplier",
              paper: "client",
            })
          : syntheticDoc(file, {
              id: "ortiz-sub-baa",
              title: "Subcontractor BAA: Daniel Ortiz (synthetic)",
              docType: "BAA",
              counterparty: "Daniel Ortiz",
              atliqEntity: "Inc",
              sideOfTable: "buyer",
              paper: "atliq",
            }),
      );
      const v2 = await reviewDeal(c.spec.dealId, {
        trigger: "eval version pair",
        version: 2,
        replace,
        add,
        withoutSimilar: true,
      });
      if (c.spec.expectComplianceAlert) confirmAllCompliance(v2);
      const e = effectiveBrief(v2, base);
      const resolvedKeys = e.changes!.resolved.map((f) => f.key);
      const problems = [
        ...c.spec.resolved
          .filter((k2: string) => !resolvedKeys.some((r) => r.startsWith(k2)))
          .map((k2: string) => `not resolved: ${k2}`),
        ...c.spec.stillOpen
          .filter(
            (k2: string) => !e.changes!.stillOpen.some((r) => r.startsWith(k2)),
          )
          .map((k2: string) => `not still open: ${k2}`),
      ];
      if (c.spec.expectedVerdict && e.verdict !== c.spec.expectedVerdict)
        problems.push(`verdict ${e.verdict}`);
      if (c.spec.expectComplianceAlert && e.complianceAlert?.status !== "open")
        problems.push("compliance alert not open");
      if (problems.length && hitQuota(v2))
        return record(
          c,
          null,
          `not run (quota): the v2 review hit a rate limit (${problems.join("; ")})`,
          "quota",
        );
      record(
        c,
        !problems.length,
        problems.length
          ? problems.join("; ")
          : `resolved ${resolvedKeys.join(", ")} · still open ${e.changes!.stillOpen.length} · new ${e.changes!.new.join(", ") || "none"} · ${e.verdict}`,
      );
    });
  }

  // ---------------------------------------------------------------- D. seller checks
  for (const c of cases.filter((c) => c.spec.kind?.startsWith("seller"))) {
    useMemoryState();
    await guarded(c, async () => {
      if (c.spec.kind === "seller") {
        const chk = await runSellerCheck(
          "gulfcrown",
          "Bhavin",
          sellerInput(c.spec.input),
        );
        const ex = c.spec.expect;
        let ok: boolean;
        let detail: string;
        if (ex.freeTextStatus) {
          const ft = chk.items.find((i) => i.item.startsWith("Also promising"));
          ok = ft?.status === ex.freeTextStatus;
          detail = `free text → ${ft?.status}: ${ft?.todo}`;
        } else {
          // The item the case is about: rates → rate item, tools → reuse item, else sector & regions.
          const worst = c.spec.input.rates
            ? chk.items.find((i) => i.item.startsWith("Rate"))!
            : c.spec.input.assets
              ? chk.items.find((i) => i.item.startsWith("Reuse"))!
              : chk.items[0];
          const entry = worst.source
            ? readJson<{ entries: RegisterEntry[] }>(
                "register.json",
              ).entries.find((e) => e.id === worst.source!.registerEntryId)
            : null;
          ok =
            worst.status === ex.status &&
            (!ex.source || entry?.sourceDocId === ex.source) &&
            !JSON.stringify(chk.items).match(
              /Crestline|Al Noor|Northwind|CloudSpan/,
            );
          detail = `${worst.status}${entry ? ` (source ${entry.sourceDocId} ${entry.clauseRef}, name hidden)` : ""} · stamped as of ${chk.asOf}, register ${chk.registerVersion}`;
          if (c.spec.recheck) {
            const again = await runSellerCheck(
              "gulfcrown",
              "Jay",
              sellerInput({ ...c.spec.input, ...c.spec.recheck }),
              chk,
            );
            const st = again.items.find((i) =>
              i.item.startsWith("Rate"),
            )?.status;
            ok = ok && st === c.spec.recheck.status;
            detail += ` → re-check at $${c.spec.recheck.rates[0].ratePerHourUsd}: ${st}`;
          }
        }
        record(c, ok, detail);
      } else if (c.spec.kind === "seller-banner") {
        const chk = await runSellerCheck(
          c.spec.dealId,
          "Bhavin",
          sellerInput({
            client: "Gulf Crown",
            sectors: ["hospitality"],
            regions: ["Saudi Arabia"],
            services: ["revenue management"],
          }),
        );
        const before = sellerBanner(chk);
        mutate((s) => {
          s.briefs[c.spec.dealId] = [
            {
              ...v1(c.spec.dealId)!,
              version: 2,
              trigger: "eval re-check",
              createdAt: new Date().toISOString(),
            },
          ];
        });
        const after = sellerBanner(chk);
        record(
          c,
          !before.show && after.show,
          `before: ${before.show ? "banner" : "no banner"} · after brief v2: ${after.show ? `banner (${after.reason})` : "no banner"}; old answer keeps its date ${chk.asOf}`,
        );
        void briefVersions;
      } else {
        const input = sellerInput(c.spec.input);
        const first = await runSellerCheck("gulfcrown", "Bhavin", input);
        const alnoor = readJson<{ entries: RegisterEntry[] }>(
          "register.json",
        ).entries.find(
          (e) => e.sourceDocId === "alnoor-msa" && e.type === "non_compete",
        )!;
        mutate((s) => {
          s.registerOverrides[alnoor.id] = {
            edits: {
              waivers: [
                ...alnoor.waivers,
                {
                  docId: "synthetic-waiver",
                  clauseRef: "§12.4",
                  covers: `revenue-management services to ${c.spec.waiverFor}, Saudi Arabia (synthetic waiver)`,
                  quote: "",
                },
              ],
            },
            at: new Date().toISOString(),
            by: "eval",
          };
          s.registerRevision += 1;
        });
        const banner = sellerBanner(first);
        const again = await runSellerCheck("gulfcrown", "Bhavin", input, first);
        const other = await runSellerCheck(
          "gulfcrown",
          "Bhavin",
          { ...input, client: "Another Saudi hotel group" },
          first,
        );
        const ok =
          first.items[0].status === "conflict" &&
          banner.show &&
          again.items[0].status === "clear" &&
          other.items[0].status === "conflict";
        record(
          c,
          ok,
          `conflict → register changed (banner: ${banner.show}) → re-run clear for ${c.spec.waiverFor}; other Saudi hotel group still ${other.items[0].status}`,
        );
      }
    });
  }

  // ---------------------------------------------------------------- E. similar past clauses
  let expected = 0;
  let found = 0;
  for (const c of cases.filter((c) => c.spec.kind === "similar")) {
    const q = c.spec.query;
    const doc = docs.find((d) => d.id === q.docId)!;
    const sec = splitSections(doc.text).find((s) => s.no === q.section);
    if (!sec) {
      record(c, false, `section ${q.section} not found in ${q.docId}`);
      continue;
    }
    let hits;
    try {
      [hits] = await withRunContext({ script: "eval", caseId: c.id }, () =>
        searchMany([
          {
            text: `${sec.heading}\n${sec.text}`.slice(0, 3000),
            clauseType: q.clauseType as ClauseType,
          },
        ]),
      );
    } catch (e) {
      if (!isQuotaExhausted(e)) throw e;
      record(c, null, `not run (quota): ${e.message}`, "quota");
      continue;
    }
    const problems: string[] = [];
    for (const e of c.spec.expect as {
      docId?: string;
      anyOf?: string[];
      label: string;
    }[]) {
      expected++;
      const ids = e.anyOf ?? [e.docId!];
      const h = hits.find((x) => ids.includes(x.chunk.docId));
      if (h && h.chunk.label === e.label) found++;
      else
        problems.push(
          `${ids.join("|")} (${e.label}) ${h ? `labelled ${h.chunk.label}` : "not in top 3"}`,
        );
    }
    const drafts = hits.filter(
      (h) => !docs.find((d) => d.id === h.chunk.docId && d.kind === "signed"),
    );
    if (drafts.length) problems.push("unsigned document returned");
    const mislabelled = hits.filter(
      (h) =>
        (h.chunk.label === "exception" || h.chunk.label === "accident") &&
        index.find((x) => x.id === h.chunk.id)?.label === "standard",
    );
    if (mislabelled.length) problems.push("one-off shown as standard");
    if (c.spec.dealId) {
      const b = v1(c.spec.dealId);
      if (b) {
        useMemoryState();
        const withPanel = effectiveBrief(b, null).verdict;
        const without = effectiveBrief({ ...b, similar: [] }, null).verdict;
        if (withPanel !== without || withPanel !== c.spec.expectedVerdict)
          problems.push(`verdict ${withPanel} / without panel ${without}`);
      }
    }
    record(
      c,
      !problems.length,
      `top 3: ${hits.map((h) => `${h.chunk.counterparty} §${h.chunk.clauseNo} [${h.chunk.label}] ${h.score.toFixed(2)}`).join(" · ")}${problems.length ? ` | ${problems.join("; ")}` : ""}`,
    );
  }

  // ---------------------------------------------------------------- cross-cutting: citations, guardrails, verdict independence, latency
  const briefs = deals.map((d) => v1(d.id)).filter((b): b is Brief => !!b);
  const noteTexts = readJson<{ id: string; text: string }[]>("notes.json");
  let cites = 0;
  let valid = 0;
  const invalid: string[] = [];
  for (const b of briefs)
    for (const f of [
      ...b.findings,
      ...(b.complianceCandidate
        ? [
            {
              key: "alert",
              citations: b.complianceCandidate.citations,
            } as unknown as Finding,
          ]
        : []),
    ])
      for (const c of f.citations) {
        cites++;
        const src =
          docs.find((d) => d.id === c.docId)?.text ??
          noteTexts.find((n) => n.id === c.docId)?.text ??
          deals.find((d) => d.id === b.dealId)?.trackerNotes.join("\n") ??
          "";
        if (locateQuote(src, c.quote)) valid++;
        else invalid.push(`${b.dealId}/${f.key}/${c.docId} ${c.clauseRef}`);
      }
  const prose = briefs.flatMap((b) => [
    b.headline,
    b.nextAction,
    ...b.findings.flatMap((f) => [f.title, f.impact, f.counterPosition ?? ""]),
    ...b.similar.flatMap((p) => p.hits.map((h) => h.differs)),
  ]);
  const legal = prose.filter(hasLegalConclusion);
  const rejects = briefs.filter(
    (b) =>
      /reject/i.test(b.verdict) || /\breject (the|this)\b/i.test(b.nextAction),
  );
  useMemoryState();
  const independent = briefs.every(
    (b) =>
      effectiveBrief(b, null).verdict ===
      effectiveBrief({ ...b, similar: [] }, null).verdict,
  );
  const ndaTimes = briefs
    .filter((b) => b.route === "nda_fast_lane")
    .map(
      (b) =>
        `${b.dealId} ${(b.usage.ms / 1000).toFixed(0)}s${b.usage.calls === 0 ? " (cached)" : ""}`,
    );

  const crossCutting = [
    {
      name: "Citation validity (all quotes string-matched to source)",
      pass: valid === cites,
      detail: `${valid}/${cites}${invalid.length ? ` · invalid: ${invalid.slice(0, 5).join(", ")}` : ""}`,
    },
    {
      name: "Guardrails: no breach/enforceable in system prose; never Reject",
      pass: !legal.length && !rejects.length,
      detail: `${prose.length} prose strings checked; ${legal.length} legal conclusions; ${rejects.length} Reject recommendations`,
    },
    {
      name: "Verdict identical with and without similar-clauses panel",
      pass: independent,
      detail: `${briefs.length} briefs`,
    },
    { name: "Register changes flag the right open deals and reach the checks (FR-2, FR-19)", ...(await registerFlagCheck()) },
    { name: "A1 no evidence, no finding: claims about the terms need a verified clause", ...evidenceCheck(briefs) },
    { name: "A2 a clear register match is never dropped silently (strong-match rules)", ...strongMatchCheck() },
    { name: "A3 one-way NDA caught by rules, whatever the title says", ...oneWayNdaCheck() },
    {
      name: "NDA fast lane latency (<1 min)",
      pass: null,
      detail: ndaTimes.join(" · ") || "no NDA briefs",
    },
    {
      name: "Recall@3 on EV-P (≥80%)",
      pass: expected ? found / expected >= 0.8 : null,
      detail: `${found}/${expected} = ${expected ? Math.round((100 * found) / expected) : 0}%`,
    },
  ];

  // ---------------------------------------------------------------- report
  const n = (st: Status) => results.filter((r) => r.status === st).length;
  console.log(
    `\nThis run: ${n("pass")} passed · ${n("fail")} failed · ${n("quota")} not run (quota) · ${n("skip")} skipped (of ${results.length})`,
  );
  for (const x of crossCutting)
    console.log(
      `${x.pass === null ? "INFO" : x.pass ? "PASS" : "FAIL"}  ${x.name}: ${x.detail}`,
    );
  const quotaCases = results
    .filter((r) => r.status === "quota")
    .map((r) => r.id);
  if (quotaCases.length)
    console.log(
      `\n■ daily quota reached, resume tomorrow: ${quotaCases.join(", ")} not run. Re-run with --case ${quotaCases.join(",")} after the reset (midnight Pacific).`,
    );

  // A filtered run (--case / --deal) updates its cases inside the last full report instead of replacing it.
  const prev =
    filtered && fs.existsSync(`eval/${RESULTS}.json`)
      ? (JSON.parse(fs.readFileSync(`eval/${RESULTS}.json`, "utf8")) as {
          results: Result[];
          crossCutting: typeof crossCutting;
        })
      : null;
  if (prev) {
    const ran = new Set(results.map((r) => r.id));
    const order = allCases.map((c) => c.id);
    const kept = prev.results
      .filter((r) => !ran.has(r.id))
      .map((r) => ({
        ...r,
        status:
          r.status ?? (r.pass === null ? "skip" : r.pass ? "pass" : "fail"),
      }));
    results.splice(
      0,
      results.length,
      ...[...kept, ...results].sort(
        (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
      ),
    );
    // Recall@3 needs the EV-P cases: keep the last full figure when this run had none.
    if (!expected) {
      const old = prev.crossCutting.find((x) => x.name.startsWith("Recall@3"));
      if (old) crossCutting[crossCutting.length - 1] = old;
    }
  }
  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const quotaCount = results.filter((r) => r.status === "quota").length;
  const skipCount = results.filter((r) => r.status === "skip").length;
  const mark: Record<Status, string> = {
    pass: "✅",
    fail: "❌",
    skip: "skip",
    quota: "⏸ not run (quota)",
  };

  const sections = [...new Set(results.map((r) => r.section))];
  // Which provider produced these numbers (the final numbers must come from the demo provider).
  const briefModels = [...new Set(deals.flatMap((d) => v1(d.id)?.models ?? []))];
  const modelLine = `LLM ${provider()} (fast: ${modelsFor("extract").join(", ")}; strong: ${modelsFor("conflict").join(", ")}) · committed briefs made by ${briefModels.join(", ") || "none"}`;
  const onOtherProvider = (m: string) => (provider() === "gemini" ? !/^gemini/.test(m) : /^gemini/.test(m));
  const mixed = deals.filter((d) => v1(d.id)?.models.some(onOtherProvider)).map((d) => d.id);
  console.log(`\n${modelLine}${mixed.length ? `\n! briefs made on another provider: ${mixed.join(", ")}` : ""}`);
  const md = [
    `# Eval results`,
    ``,
    `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · APP_TODAY ${process.env.APP_TODAY ?? "2026-10-04"} · cases from \`docs/Eval_Set.md\` via \`eval/cases.json\`.`,
    ``,
    `Models: ${modelLine}.${mixed.length ? ` **Warning: ${mixed.join(", ")} were reviewed on another provider; regenerate them before quoting these numbers.**` : ""}`,
    ``,
    `**${passCount} passed · ${failCount} failed · ${quotaCount} not run (quota) · ${skipCount} skipped** (of ${results.length} cases)${prev ? ` · last partial run: ${[...args.cases, ...dealFilter].join(", ")}` : ""}`,
    ...(quotaCount
      ? [
          ``,
          `_"Not run (quota)" = the free-tier daily quota or a rate limit stopped the case; it says nothing about the logic. Re-run it after the reset._`,
        ]
      : []),
    ``,
    `## Cross-cutting checks (PRD §11)`,
    ``,
    `| Check | Result | Detail |`,
    `|---|---|---|`,
    ...crossCutting.map(
      (x) =>
        `| ${x.name} | ${x.pass === null ? "info" : x.pass ? "✅" : "❌"} | ${x.detail.replace(/\|/g, "/")} |`,
    ),
    ``,
    ...sections.flatMap((s) => [
      `## ${s}`,
      ``,
      `| Case | Result | Detail |`,
      `|---|---|---|`,
      ...results
        .filter((r) => r.section === s)
        .map(
          (r) =>
            `| ${r.id} ${r.title.slice(0, 60).replace(/\|/g, "/")} | ${mark[r.status]} | ${r.detail.replace(/\|/g, "/").slice(0, 400)} |`,
        ),
      ``,
    ]),
  ].join("\n");
  fs.writeFileSync(`eval/${RESULTS}.md`, md + "\n");
  fs.writeFileSync(
    `eval/${RESULTS}.json`,
    JSON.stringify(
      { at: new Date().toISOString(), provider: provider(), models: modelLine, results, crossCutting },
      null,
      2,
    ) + "\n",
  );
  console.log("\nwrote eval/results.md");
  void readState;
}

const rank = (s: string) =>
  ({ clear: 0, couldnt_check: 1, attention: 2, conflict: 3 })[s] ?? 0;

function sellerInput(p: Partial<SellerInput>): SellerInput {
  return {
    client: "",
    sectors: [],
    regions: [],
    services: [],
    rates: [],
    assets: [],
    dataHandling: "",
    partnership: false,
    freeText: "",
    ...p,
  };
}

main();

/**
 * Register edits (no model calls, in-memory state): verify flags nothing; a restriction edit / reject /
 * restore flags every open deal and changes the seller check's answer; a client duty flags only that
 * client's deals; an entry no check reads (insurance) flags none.
 */
async function registerFlagCheck(): Promise<{ pass: boolean; detail: string }> {
  const open = deals.map((d) => d.id).sort();
  const nc = () => registerEntries({ includeRejected: true }).find((e) => e.sourceDocId === "alnoor-msa" && e.type === "non_compete")!;
  const gulf = () => runSellerCheck("gulfcrown", "eval", sellerInput({ client: "Gulf Crown", sectors: ["hospitality"], regions: ["Saudi Arabia"], services: ["revenue management"] }));
  const same = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
  const checks: [string, boolean][] = [];

  useMemoryState();
  checks.push(["verify flags nothing", same(applyRegisterChange(nc().id, "verify", undefined, "eval").flagged, [])]);

  useMemoryState();
  const before = (await gulf()).items[0].status;
  const edit = applyRegisterChange(nc().id, "edit", { end: "2025-01-01", perpetual: false }, "eval");
  const afterEdit = (await gulf()).items[0].status;
  checks.push([`restriction edit flags all ${open.length} open deals`, same(edit.flagged, open) && edit.flagged.every((id) => !!readState().dealOverrides[id]?.staleSince)]);
  checks.push([`ending it changes the seller check (${before} → ${afterEdit})`, before === "conflict" && afterEdit !== "conflict"]);

  useMemoryState();
  const rej = applyRegisterChange(nc().id, "reject", undefined, "eval");
  const afterReject = (await gulf()).items[0].status;
  applyRegisterChange(nc().id, "restore", undefined, "eval");
  const afterRestore = (await gulf()).items[0].status;
  checks.push([`reject flags all and stops the conflict (${afterReject}); restore brings it back (${afterRestore})`, same(rej.flagged, open) && afterReject !== "conflict" && afterRestore === "conflict"]);

  useMemoryState();
  const duty = registerEntries().find((e) => e.id === "harrington-nda#1");
  const dutyFlags = duty ? applyRegisterChange(duty.id, "edit", { summary: duty.summary + " (edited)" }, "eval").flagged : ["missing entry"];
  checks.push([`client duty edit flags only that client's deals (${dutyFlags.join(", ")})`, same(dutyFlags, ["harrington"])]);

  useMemoryState();
  const ins = registerEntries().find((e) => e.type === "insurance")!;
  checks.push(["insurance edit flags nothing (no check reads it)", same(applyRegisterChange(ins.id, "edit", { summary: ins.summary + " (edited)" }, "eval").flagged, [])]);

  useMemoryState();
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return { pass: !failed.length, detail: failed.length ? `failed: ${failed.join("; ")}` : checks.map(([n]) => n).join("; ") };
}

/**
 * A1 (lib/review/guardrails.ts requireEvidence): across every brief, no counted finding about the contract's
 * terms lacks a verified citation; and a made-up finding injected into a real brief is shown as unsupported
 * but can't change the verdict.
 */
function evidenceCheck(briefs: Brief[]): { pass: boolean; detail: string } {
  useMemoryState();
  const structural = new Set(["bundle", "dependency", "mismatch"]);
  const counted = briefs.flatMap((b) => effectiveBrief(b, null).findings.filter((x) => !structural.has(x.category) && !x.citations.length && x.severity !== "low").map((x) => `${b.dealId}/${x.key}`));
  const shown = briefs.reduce((n, b) => n + effectiveBrief(b, null).findings.filter((x) => x.unsupported).length, 0);
  const base = briefs.find((b) => b.dealId === "loopmart") ?? briefs[0];
  const before = effectiveBrief(base, null).verdict;
  const fake = { key: "playbook:liability", category: "playbook", topic: "liability", title: "Unlimited liability for AtliQ", impact: "AtliQ has unlimited liability.", severity: "high", confidence: "high", needsJudgment: false, owner: "Karandeep", citations: [] } as unknown as Finding;
  const after = effectiveBrief({ ...base, findings: [...base.findings, fake] }, null);
  const injected = after.findings.find((x) => x.key === "playbook:liability" && x.title === fake.title);
  const ok = !counted.length && after.verdict === before && !!injected?.unsupported && injected.severity === "low";
  return {
    pass: ok,
    detail: `${counted.length ? `counted without evidence: ${counted.join(", ")}` : "no counted finding lacks a clause"} · ${shown} shown as unsupported · injected "unlimited liability" on ${base.dealId}: verdict ${before} → ${after.verdict}, ${injected?.unsupported ? "marked unsupported (low)" : "NOT caught"}`,
  };
}

/**
 * A2 (lib/review/conflict.ts): which register matches count as "strong" (a dismissal by the model is kept as
 * "possible collision: confirm", and an unassessed one too). Pure rules, no model call.
 */
function strongMatchCheck(): { pass: boolean; detail: string } {
  useMemoryState();
  const reg = registerEntries();
  const src = new Map(docs.filter((d) => d.kind === "signed").map((d) => [d.id, d.text]));
  const base = { entities: ["Pvt Ltd", "Inc"], sectors: [] as string[], regions: [] as string[], assets: [] as string[], hasRates: false, services: [] as string[], rateRoles: [] as string[] };
  const strongOf = (facts: typeof base, id: string) => filterRegister(reg, facts, src).find((c) => c.entry.id === id)?.strong ?? null;
  const cases: [string, boolean | null, boolean | null][] = [
    ["Al Noor non-compete vs hospitality in Saudi Arabia (specific scope, both overlap)", strongOf({ ...base, sectors: ["hospitality"], regions: ["Saudi Arabia"] }, "alnoor-msa#1"), true],
    ["Crestline pricing promise vs a deal pricing a Senior Data Engineer (same role)", strongOf({ ...base, hasRates: true, rateRoles: ["Senior Data Engineer"] }, "crestline-msa#1"), true],
    ["Crestline pricing promise vs rates for other roles (worldwide scope alone isn't explicit)", strongOf({ ...base, hasRates: true, rateRoles: ["Revenue Manager"] }, "crestline-msa#1"), false],
    ["Northwind IP assignment vs a deal reusing PipeKit (named tool)", strongOf({ ...base, assets: ["PipeKit"] }, "northwind-msa#1"), true],
    ["Northwind IP assignment vs generic 'tools' (not a named tool)", strongOf({ ...base, assets: ["tools"] }, "northwind-msa#1"), false],
  ];
  const cand = filterRegister(reg, { ...base, sectors: ["hospitality"], regions: ["Saudi Arabia"] }, src).find((c) => c.entry.id === "alnoor-msa#1")!;
  const flag = unconfirmed(cand, docs.find((d) => d.id === "gulfcrown-msa")!, new Map(docs.map((d) => [d.id, d])), "test");
  const flagOk = flag.severity === "high" && flag.needsJudgment && flag.citations.length > 0;
  const wrong = cases.filter(([, got, want]) => got !== want).map(([n, got]) => `${n}: got ${got}`);
  return {
    pass: !wrong.length && flagOk,
    detail: wrong.length ? `wrong: ${wrong.join("; ")}` : `${cases.length} strong-match rules right · a dismissed / unassessed strong match becomes "${flag.title}" (high, confirm, cites the register clause)`,
  };
}

/** A3 (lib/review/playbook.ts oneWayNda): fires on the one-way NDAs, never on a mutual one. Pure rules. */
function oneWayNdaCheck(): { pass: boolean; detail: string } {
  const text = (id: string) => docs.find((d) => d.id === id)!.text;
  const oneWay = ["finserve-nda", "meridian-nda"];
  const mutual = ["alnoor-nda", "harrington-nda", "ortiz-nda", "loopmart-nda"];
  const v2 = fs.readFileSync("test-uploads/FinServe_NDA_v2_mutual.md", "utf8");
  const missed = oneWay.filter((id) => oneWayNda(text(id)).length < 2);
  const falseHits = [...mutual.filter((id) => oneWayNda(text(id)).length), ...(oneWayNda(v2).length ? ["finserve-v2"] : [])];
  return {
    pass: !missed.length && !falseHits.length,
    detail: `one-way caught (definition + obligations): ${oneWay.filter((id) => !missed.includes(id)).join(", ")}${missed.length ? ` · missed: ${missed.join(", ")}` : ""} · mutual left alone: ${mutual.length + 1 - falseHits.length}/${mutual.length + 1}${falseHits.length ? ` · false hits: ${falseHits.join(", ")}` : ""}`,
  };
}
