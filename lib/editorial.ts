/**
 * The dataset's editorial lines are not part of the documents. Meeting notes end with a narrator's
 * italic line ("*(No decisions were made. As of 2026-09-28 no BAA had been signed …)*") that the dataset's
 * README calls ground truth: it states what happened afterwards, i.e. the answer. A real meeting note has
 * no such line, so it is removed before the review sees the note (otherwise the eval leaks its answer).
 * The SYN_ files also open with a "SYNTHETIC DATA — SYN-xx · Dataset extension …" provenance line.
 */
const NARRATOR = /^\*\((?:[^()]|\([^()]*\))*\)\*\s*$/;

/** A meeting note without the dataset's narrator lines (whole-line italic parentheticals). */
export function stripNarrator(note: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const kept = note
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => {
      if (NARRATOR.test(l.trim())) {
        removed.push(l.trim());
        return false;
      }
      return true;
    });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", removed };
}

/** A SYN_ document's provenance line in the original dataset's form ("*(Text extracted from executed PDF …)*"). */
export function stripSynHeader(text: string): string {
  return text.replace(/^\*\(SYNTHETIC DATA — SYN-[A-Z0-9]+ · Dataset extension, not part of the original capstone set\.\s*/, "*(");
}
