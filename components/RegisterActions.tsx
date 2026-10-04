import type { RegisterEntry } from "@/lib/types";

/** Verify / Edit / Reject (FR-2) arrive in Phase 3; the register is read-only in Phase 1e. */
export function RegisterActions({ entry }: { entry: RegisterEntry }) {
  void entry;
  return null;
}
