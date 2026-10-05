"use client";
/**
 * Interactive controls in the brief. Every click is saved to the server immediately (autosave):
 * buttons show "Saving…" while the request runs and "Saved ✓" after, so Karandeep can leave and come
 * back at any time without losing partial work. Every choice can be changed afterwards.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { answerFollowUp, closeAlert } from "@/app/deal/actions";
import { LIMITS } from "@/lib/limits";

/** Submit button with a visible saving state (useFormStatus) and a short "Saved ✓" confirmation. */
export function SaveButton({ children, className = "btn", name, value, savedLabel = "Saved ✓", pendingLabel = "Saving…" }: { children: ReactNode; className?: string; name?: string; value?: string; savedLabel?: string; pendingLabel?: string }) {
  const { pending, data } = useFormStatus();
  const mine = !name || data?.get(name) === value;
  const [justSaved, setJustSaved] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && mine) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1600);
      return () => clearTimeout(t);
    }
    was.current = pending && mine;
  }, [pending, mine]);
  return (
    <button className={className} name={name} value={value} disabled={pending} aria-busy={pending && mine}>
      {pending && mine ? pendingLabel : justSaved ? savedLabel : children}
    </button>
  );
}

const DIG_REASONS = ["Missing context", "Didn't trust a citation", "Brief unclear", "Other"];

/** FR-12 follow-up question. "Yes" opens the (optional) reason straight away. */
export function FollowUpQuestion({ dealId, version }: { dealId: string; version: number }) {
  const [yes, setYes] = useState(false);
  return (
    <form action={answerFollowUp} className="space-y-2 rounded-lg bg-paper p-3 text-sm">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="version" value={version} />
      <div className="flex flex-wrap items-center gap-2">
        <span>Did you need to open the full contract or other documents to decide?</span>
        <SaveButton name="answer" value="no">
          No
        </SaveButton>
        <button type="button" className={`btn ${yes ? "btn-primary" : ""}`} onClick={() => setYes(true)}>
          Yes
        </button>
      </div>
      {yes && (
        <div className="flex flex-wrap items-center gap-2">
          <select name="reason" defaultValue="" aria-label="Why did you need to open it? (optional)">
            <option value="">Why? (optional)</option>
            {DIG_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input name="note" maxLength={LIMITS.note} placeholder="Anything to add? (optional)" className="min-w-64 flex-1" />
          <SaveButton name="answer" value="yes" className="btn btn-primary">
            Save answer
          </SaveButton>
        </div>
      )}
    </form>
  );
}

/**
 * Close a compliance alert (FR-21) with ONE control: type a note or reference, attach a file, or both.
 * With a file it is recorded as "resolved with evidence"; text alone as "resolved by Karandeep's note".
 */
export function ResolveAlertForm({ dealId, accept }: { dealId: string; accept: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [n, setN] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <form action={closeAlert} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="how" value="resolve" />
      <span className="block w-96 space-y-1">
        <span className="relative block">
          <input
            name="note"
            maxLength={LIMITS.note}
            required={!file}
            onChange={(e) => setN(e.currentTarget.value.length)}
            placeholder={file ? "Add a note (optional)" : "How was it resolved? Note or reference, or attach a file"}
            className="w-full pr-20"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <span className={`text-[11px] tabular-nums ${n >= LIMITS.note * 0.9 ? "text-hold" : "text-muted"}`}>
              {n}/{LIMITS.note}
            </span>
            <button type="button" title="Attach a file" aria-label="Attach a file" onClick={() => fileRef.current?.click()} className="text-base leading-none text-brand hover:opacity-70">
              📎
            </button>
          </span>
        </span>
        <input ref={fileRef} type="file" name="file" accept={accept} className="hidden" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        {file && (
          <span className="flex items-center gap-2 text-xs">
            <span className="chip bg-brand-soft text-brand">
              📄 {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
            </span>
            <button
              type="button"
              className="text-muted underline"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              remove
            </button>
          </span>
        )}
      </span>
      <SaveButton className="btn btn-primary">{file ? "Resolve (evidence attached)" : "Resolve"}</SaveButton>
    </form>
  );
}
