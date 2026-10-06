"use client";
import { useState, type ReactNode } from "react";
import { registerAction } from "@/app/deal/actions";
import { SaveButton } from "@/components/BriefControls";
import { TextArea, TextInput } from "@/components/Fields";
import { LIMITS } from "@/lib/limits";
import { Region, Sector, type RegisterEntry } from "@/lib/types";

/**
 * One register entry (FR-2): Verify / Edit / Reject at the top right. Edit turns the whole card into a
 * form (the source clause stays verbatim); saving verifies the entry and flags only the open deals it
 * can affect (lib/registerEdit.ts). A rejected entry is dimmed, but its Restore button stays clickable.
 */
export function RegisterEntryCard({ e, head, body, typeLabels }: { e: RegisterEntry; head: ReactNode; body: ReactNode; typeLabels: Record<string, string> }) {
  const [editing, setEditing] = useState(false);
  const act = (action: string, label: string, primary = false) => (
    <form action={registerAction}>
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="action" value={action} />
      <SaveButton className={`btn !py-1 !text-xs ${primary ? "btn-primary" : ""}`}>{label}</SaveButton>
    </form>
  );
  return (
    <article id={e.id} className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className={`min-w-0 flex-1 space-y-1 ${e.rejected ? "opacity-60" : ""}`}>{head}</div>
        <div className="flex shrink-0 gap-2">
          {e.rejected ? (
            act("restore", "Restore", true)
          ) : editing ? (
            <button type="button" className="btn !py-1 !text-xs" onClick={() => setEditing(false)}>
              Cancel
            </button>
          ) : (
            <>
              {e.verified ? act("unverify", "Unverify") : act("verify", "Verify", true)}
              <button type="button" className="btn !py-1 !text-xs" onClick={() => setEditing(true)}>
                Edit
              </button>
              {act("reject", "Reject")}
            </>
          )}
        </div>
      </div>
      {editing ? <EditForm e={e} typeLabels={typeLabels} onDone={() => setEditing(false)} /> : <div className={e.rejected ? "opacity-60" : ""}>{body}</div>}
    </article>
  );
}

function EditForm({ e, typeLabels, onDone }: { e: RegisterEntry; typeLabels: Record<string, string>; onDone: () => void }) {
  const checks = (name: string, options: readonly string[], chosen: string[]) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-1.5 capitalize">
          <input type="checkbox" name={name} value={o} defaultChecked={chosen.includes(o)} /> {o.replace(/_/g, " ")}
        </label>
      ))}
    </div>
  );
  const box = (label: string, children: ReactNode) => (
    <div className="space-y-1">
      <span className="label">{label}</span>
      {children}
    </div>
  );
  return (
    <form
      action={async (fd) => {
        await registerAction(fd);
        onDone();
      }}
      className="space-y-4 border-t border-line pt-4 text-sm"
    >
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="action" value="edit" />
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        {box("Title", <TextInput name="title" defaultValue={e.title} max={LIMITS.name} required className="w-full" />)}
        {box(
          "Type",
          <select name="type" defaultValue={e.type} className="w-full">
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>,
        )}
      </div>
      {box("Summary", <TextArea name="summary" defaultValue={e.summary} rows={3} max={LIMITS.summary} required className="w-full" />)}
      {box(
        "Binds",
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="binds" value="Pvt Ltd" defaultChecked={e.bindsEntities.includes("Pvt Ltd")} /> AtliQ Technologies Pvt Ltd (India)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="binds" value="Inc" defaultChecked={e.bindsEntities.includes("Inc")} /> AtliQ Inc (USA)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="includesAffiliates" defaultChecked={e.includesAffiliates} /> Also binds affiliates
          </label>
        </div>,
      )}
      {box("Sectors (none = any sector)", checks("sectors", Sector.options, e.scope.sectors))}
      {box("Regions (none = anywhere)", checks("regions", Region.options, e.scope.regions))}
      <div className="grid gap-3 md:grid-cols-3">
        {box("Services (comma-separated)", <TextInput name="services" defaultValue={e.scope.services.join(", ")} max={LIMITS.summary} className="w-full" />)}
        {box("Tools / IP (comma-separated)", <TextInput name="assets" defaultValue={e.scope.assets.join(", ")} max={LIMITS.summary} className="w-full" />)}
        {box("Limited to (comma-separated)", <TextInput name="counterparties" defaultValue={e.scope.counterparties.join(", ")} max={LIMITS.summary} className="w-full" />)}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {box("Starts", <input type="date" name="start" defaultValue={e.start ?? ""} />)}
        {box("Ends", <input type="date" name="end" defaultValue={e.end ?? ""} />)}
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" name="perpetual" defaultChecked={e.perpetual} /> No end date (permanent)
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" name="routine" defaultChecked={e.routine} /> Routine: never flag it
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SaveButton className="btn btn-primary" pendingLabel="Saving…" savedLabel="Saved & verified ✓">
          Save &amp; verify
        </SaveButton>
        <span className="text-xs text-muted">Open deals this entry can affect are flagged for re-check.</span>
      </div>
    </form>
  );
}
