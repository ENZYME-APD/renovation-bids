"use client";

import { useEffect, useRef, useState } from "react";

/** Export dropdown: Excel and CSV downloads from a route that takes ?format=. Closes on outside click or Esc. */
export function ExportMenu({ href, label = "Export" }: { href: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sep = href.includes("?") ? "&" : "?";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-quiet py-1 text-sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        {label} ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-line bg-surface p-1 text-sm shadow-lg">
          <a role="menuitem" className="block rounded px-3 py-2 hover:bg-paper" href={`${href}${sep}format=xlsx`} download onClick={() => setOpen(false)}>
            Excel (.xlsx)
            <span className="block text-xs text-muted">Formatted, with filters. Opens in Google Sheets too.</span>
          </a>
          <a role="menuitem" className="block rounded px-3 py-2 hover:bg-paper" href={`${href}${sep}format=csv`} download onClick={() => setOpen(false)}>
            CSV
            <span className="block text-xs text-muted">Plain data for other tools.</span>
          </a>
          <a role="menuitem" className="block rounded px-3 py-2 hover:bg-paper" href={`${href}${sep}format=json`} download onClick={() => setOpen(false)}>
            JSON
            <span className="block text-xs text-muted">For scripts and other software.</span>
          </a>
          <p className="px-3 py-2 text-xs text-muted">Edit the file and bring it back with Import. Google Sheets: in Drive, upload the Excel file and open it with Google Sheets.</p>
        </div>
      )}
    </div>
  );
}
