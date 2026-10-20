"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A native <dialog>: focus is trapped, Esc and a click on the backdrop close it. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-xl"} rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button type="button" onClick={onClose} className="-mr-2 -mt-1 px-2 text-xl leading-none text-muted hover:text-ink" aria-label="Close">×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
