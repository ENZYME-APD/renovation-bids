"use client";

import { ImportDialog } from "@/components/import-dialog";
import { importCatalogue } from "./import-actions";

export function CatalogueImport() {
  return (
    <ImportDialog
      action={importCatalogue}
      title="Import catalogue"
      applyLabel="Import"
      intro={
        <p>
          Export the catalogue, edit it in Excel or Google Sheets, and import it back (Excel, CSV or JSON; one row per partida, matched by Code).
          Edited standard partidas become your studio&apos;s version, new codes become studio partidas (they need a Chapter code and a Description),
          and a changed Unit price is saved as a new price, keeping the history.
        </p>
      }
      renderPreview={(p: { rows: number; known: number; newCodes: string[]; withPrice: number }) => (
        <p>
          <b>{p.rows}</b> rows: {p.known} existing codes, {p.newCodes.length} new{p.newCodes.length ? ` (${p.newCodes.slice(0, 20).join(", ")}${p.newCodes.length > 20 ? "…" : ""})` : ""}.
          {" "}{p.withPrice} with a price (only changed prices are recorded).
        </p>
      )}
      renderDone={(d: { created: number; updated: number; unchanged: number; prices: number }) => (
        <p className="text-ok">Done: {d.created} created, {d.updated} updated, {d.unchanged} unchanged, {d.prices} new prices.</p>
      )}
    />
  );
}
