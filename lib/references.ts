/** Contract numbers printed on documents (e.g. HHS-IT-2026-0193): explicit cross-references for deal linking (FR-3). */
const REF_RE = /\b[A-Z]{2,5}(?:[-/][A-Z0-9]{2,}){2,}\b/g;

export function extractReferences(text: string): string[] {
  return [...new Set(text.match(REF_RE) ?? [])].filter((r) => /\d/.test(r));
}
