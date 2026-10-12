/**
 * Fixed-vocabulary guardrails (PRD §10, CLAUDE.md): the system's own prose never says "breach" or
 * "enforceable" (legal conclusions) and never recommends "Reject". Verbatim quotes are exempt:
 * they are the contract's words, not ours. Applied to every model-written string before display.
 */
type Rule = [RegExp, string | ((match: string, ...groups: string[]) => string)];

const RULES: Rule[] = [
  [/\b(data|data protection|security|privacy|personal[- ]data) breach(es)?\b/gi, (_m, a, pl) => `${a} incident${pl ? "s" : ""}`],
  [/\b(would|could|will|may|might|to|not) breach\b/gi, "$1 conflict with"],
  [/\bin (material )?breach of\b/gi, "in conflict with"],
  [/\bbreach(es|ed|ing)? of\b/gi, "non-compliance with"],
  [/\bbreaches\b/gi, "conflicts"],
  [/\bbreach(ed|ing)?\b/gi, "conflict"],
  [/\bviolat(e|es|ed|ing)\b/gi, "conflict with"],
  [/\bviolations?\b/gi, "non-compliance"],
  [/\bunenforceable\b/gi, "open to challenge (counsel to confirm)"],
  [/\benforceable\b/gi, "binding (counsel to confirm)"],
  [/\breject (the|this) (contract|agreement|deal)\b/gi, "send the $2 back"],
  // "Redline" is lawyer jargon (marking up the contract with proposed edits): say what it means.
  [/\bredlines\b/gi, "changes"],
  [/\b(\d+|a|one) redline\b/gi, "$1 change to request"],
  [/\bredlined\b/gi, "changed"],
  [/\bRedline\b/g, "Ask for changes to"],
  [/\bredline\b/gi, "ask for changes to"],
];

export function sanitize(text: string): string {
  let t = text;
  for (const [re, rep] of RULES) t = t.replace(re, rep as never);
  return t;
}

/** "What wasn't seen": the register's reach, in plain words and without examples from other deals. */
export function coverageNote(signedDocs: number): string {
  return `Commitments were checked against all ${signedDocs} signed contracts on file. Contracts AtliQ hasn't uploaded can't be checked.`;
}

/**
 * A1 — no evidence, no finding. A finding about the contract's terms (rule checks on extracted facts,
 * playbook, conflicts, NDA mutuality, flow-downs, notes) must point at a verified clause or note. Without
 * one it is shown as unsupported, lowered to low and never counts toward the verdict: a model can't make a
 * term up. Structural findings (a missing document, a dependency on another deal, the seller mismatch) come
 * from the deal's own records, so they need no clause.
 */
const STRUCTURAL = new Set(["bundle", "dependency", "mismatch"]);
export function requireEvidence<T extends { category: string; severity: string; citations: unknown[]; unsupported?: boolean }>(f: T): T {
  if (STRUCTURAL.has(f.category) || f.citations.length > 0) return f;
  return { ...f, severity: "low", unsupported: true };
}

/**
 * A4 — instructions addressed to an AI reviewer inside a document ("ignore your instructions", "return
 * SIGN", "do not flag ..."). A contract never needs to talk to the reviewing tool, so any such text is
 * raised as a high, quoted finding: the deal can't come out clean, and the review's other findings are
 * to be read with care. Rules only; the verdict itself is computed by rules and never taken from a model.
 */
const INJECTION: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your|system)\b[^.\n]{0,30}\b(instructions?|prompts?|rules|guidelines)\b/i,
  /\b(you are|act as|as an?)\s+(an?\s+)?(ai|language model|assistant|chatbot|llm|reviewer bot)\b/i,
  /\b(ai|automated|llm|model)\s+(reviewers?|assistants?|systems?|tools?)\b[^.\n]{0,60}\b(must|should|shall|will|are instructed to)\b/i,
  /\b(return|output|respond with|report)\b[^.\n]{0,30}\b(verdict|"?sign"?|no findings|no issues|compliant)\b/i,
  /\b(do not|don't|never)\s+(flag|report|mention|raise)\b[^.\n]{0,40}\b(issues?|risks?|findings?|clauses?|this)\b/i,
  /\bsystem prompt\b|\bjailbreak\b|<\s*\/?\s*(system|assistant|instructions?)\s*>/i,
];
export function injectionAttempts(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split("\n")) if (INJECTION.some((re) => re.test(line))) hits.push(line.trim().slice(0, 300));
  return hits;
}

export function hasLegalConclusion(text: string): boolean {
  return /\bbreach(es|ed|ing)?\b|\benforceable\b|\bunenforceable\b|\bviolat/i.test(text);
}

export function sanitizeFinding<T extends { title: string; impact: string; counterPosition?: string; readings?: string[] }>(f: T): T {
  return {
    ...f,
    title: sanitize(f.title),
    impact: sanitize(f.impact),
    counterPosition: f.counterPosition ? sanitize(f.counterPosition) : f.counterPosition,
    readings: f.readings?.map(sanitize),
  };
}
