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
