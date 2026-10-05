import { registerAction } from "@/app/deal/actions";
import type { RegisterEntry } from "@/lib/types";

/** FR-2: Verify / Edit / Reject (~1 minute per entry, source clause shown alongside). */
export function RegisterActions({ entry: e }: { entry: RegisterEntry }) {
  const btn = (action: string, label: string, primary = false) => (
    <form action={registerAction}>
      <input type="hidden" name="id" value={e.id} />
      <button name="action" value={action} className={`btn !py-1 !text-xs ${primary ? "btn-primary" : ""}`}>
        {label}
      </button>
    </form>
  );
  if (e.rejected) return <div className="flex gap-2">{btn("restore", "Restore")}</div>;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {e.verified ? btn("unverify", "Unverify") : btn("verify", "Verify", true)}
      <details className="relative">
        <summary className="btn list-none !py-1 !text-xs">Edit</summary>
        <form action={registerAction} className="card absolute right-0 z-10 mt-1 w-80 space-y-2 p-3 text-sm shadow-lg">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="action" value="edit" />
          <label className="block">
            <span className="label">Title</span>
            <input name="title" defaultValue={e.title} className="w-full" />
          </label>
          <label className="block">
            <span className="label">Summary</span>
            <textarea name="summary" defaultValue={e.summary} rows={3} className="w-full" />
          </label>
          <label className="block">
            <span className="label">End date</span>
            <input name="end" type="date" defaultValue={e.end ?? ""} className="w-full" />
          </label>
          <label className="flex items-center gap-2">
            <input name="includesAffiliates" type="checkbox" defaultChecked={e.includesAffiliates} /> Binds affiliates
          </label>
          <p className="text-xs text-muted">Saving verifies the entry and flags open deals for re-check.</p>
          <button className="btn btn-primary w-full">Save &amp; verify</button>
        </form>
      </details>
      {btn("reject", "Reject")}
    </div>
  );
}
