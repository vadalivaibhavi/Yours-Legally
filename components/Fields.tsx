"use client";
/**
 * Inputs with a hard character limit (maxLength) and a live counter, plus a popover that closes on
 * outside click, Escape, or after its form is submitted.
 */
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

function Counter({ n, max }: { n: number; max: number }) {
  const near = n >= max * 0.9;
  return <span className={`text-[11px] tabular-nums ${near ? "text-hold" : "text-muted"}`}>{n}/{max}</span>;
}

export function TextInput({ max, className = "", defaultValue, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "maxLength"> & { max: number }) {
  const [n, setN] = useState(String(defaultValue ?? "").length);
  return (
    <span className={`relative block ${className}`}>
      <input {...props} defaultValue={defaultValue} maxLength={max} onChange={(e) => setN(e.currentTarget.value.length)} className="w-full pr-14" />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <Counter n={n} max={max} />
      </span>
    </span>
  );
}

export function TextArea({ max, className = "", defaultValue, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "maxLength"> & { max: number }) {
  const [n, setN] = useState(String(defaultValue ?? "").length);
  return (
    <span className={`block ${className}`}>
      <textarea {...props} defaultValue={defaultValue} maxLength={max} onChange={(e) => setN(e.currentTarget.value.length)} className="w-full" />
      <span className="block text-right">
        <Counter n={n} max={max} />
      </span>
    </span>
  );
}

/** A button that opens a small panel; closes on outside click, Escape, or when a form inside is submitted. */
export function Popover({ label, children, align = "left", width = "w-72", buttonClassName = "btn" }: { label: ReactNode; children: ReactNode; align?: "left" | "right"; width?: string; buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" className={buttonClassName} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`card absolute z-20 mt-1 space-y-2 p-3 shadow-lg ${width} ${align === "right" ? "right-0" : "left-0"}`} onSubmit={() => setTimeout(() => setOpen(false), 0)}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Selects that apply the filter as soon as they change (GET form, no Filter button). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** Long verbatim quotes show their first ~450 characters with a toggle, so one clause can't swamp a finding. */
export function ClampedText({ text, limit = 450 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= limit + 80) return <>{text}</>;
  return (
    <>
      {open ? text : text.slice(0, limit).replace(/\s+\S*$/, "") + " …"}{" "}
      <button type="button" onClick={() => setOpen((o) => !o)} className="font-sans text-xs font-semibold text-brand underline">
        {open ? "Show less" : "Show full clause"}
      </button>
    </>
  );
}

/**
 * Evidence for closing a compliance alert: type a reference, attach a file (paperclip inside the box), or both.
 * The text box is required only while no file is attached.
 */
export function EvidenceField({ maxText, accept }: { maxText: number; accept: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [n, setN] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <span className="block w-80 space-y-1">
      <span className="relative block">
        <input
          name="note"
          maxLength={maxText}
          required={!file}
          onChange={(e) => setN(e.currentTarget.value.length)}
          placeholder={file ? "Add a note (optional)" : "Evidence reference, or attach a file"}
          className="w-full pr-20"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <span className={`text-[11px] tabular-nums ${n >= maxText * 0.9 ? "text-hold" : "text-muted"}`}>{n}/{maxText}</span>
          <button type="button" title="Attach a file" aria-label="Attach a file" onClick={() => fileRef.current?.click()} className="text-base leading-none text-brand hover:opacity-70">
            📎
          </button>
        </span>
      </span>
      <input ref={fileRef} type="file" name="file" accept={accept} className="hidden" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
      {file && (
        <span className="flex items-center gap-2 text-xs">
          <span className="chip bg-brand-soft text-brand">📄 {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB</span>
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
  );
}

/** The brief rolls open in place under its summary row; one button opens and closes it. */
export function Collapsible({ summary, children, defaultOpen = false, openLabel = "Open brief", closeLabel = "Close brief" }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; openLabel?: string; closeLabel?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    // One rectangle: the summary is the header, the content opens inside it.
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        {summary}
        <button type="button" className="btn btn-primary ml-auto" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? `${closeLabel} ▴` : `${openLabel} ▾`}
        </button>
      </div>
      {open && <div className="border-t border-line p-4 md:p-5">{children}</div>}
    </div>
  );
}
