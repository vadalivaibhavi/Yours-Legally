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
