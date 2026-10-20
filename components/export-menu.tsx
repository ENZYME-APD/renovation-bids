"use client";

/** Export dropdown: Excel and CSV downloads from a route that takes ?format=. */
export function ExportMenu({ href, label = "Export" }: { href: string; label?: string }) {
  const sep = href.includes("?") ? "&" : "?";
  return (
    <details className="relative">
      <summary className="btn-quiet cursor-pointer list-none py-1 text-sm [&::-webkit-details-marker]:hidden">{label} ▾</summary>
      <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-line bg-surface p-1 text-sm shadow-lg">
        <a className="block rounded px-3 py-2 hover:bg-paper" href={`${href}${sep}format=xlsx`} download>
          Excel (.xlsx)
          <span className="block text-xs text-muted">Formatted, with filters. Opens in Google Sheets too.</span>
        </a>
        <a className="block rounded px-3 py-2 hover:bg-paper" href={`${href}${sep}format=csv`} download>
          CSV
          <span className="block text-xs text-muted">Plain data for other tools.</span>
        </a>
        <p className="px-3 py-2 text-xs text-muted">
          Google Sheets: in Drive, upload the Excel file and open it with Google Sheets.
        </p>
      </div>
    </details>
  );
}
