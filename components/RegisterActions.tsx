import { registerAction } from "@/app/deal/actions";
import { Popover, TextArea, TextInput } from "@/components/Fields";
import { LIMITS } from "@/lib/limits";
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
      <Popover label="Edit" align="right" width="w-80" buttonClassName="btn !py-1 !text-xs">
        <form action={registerAction} className="space-y-2 text-sm">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="action" value="edit" />
          <label className="block">
            <span className="label">Title</span>
            <TextInput name="title" defaultValue={e.title} max={LIMITS.name} required />
          </label>
          <label className="block">
            <span className="label">Summary</span>
            <TextArea name="summary" defaultValue={e.summary} rows={3} max={LIMITS.summary} required />
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
      </Popover>
      {btn("reject", "Reject")}
    </div>
  );
}
