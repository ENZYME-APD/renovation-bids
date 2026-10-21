"use client";

import { useActionState, useState } from "react";
import { addRoom, deleteRoom, updateRoom } from "./actions";
import { useCloseOnSuccess } from "./add-line-form";

export type Template = { id: string; code: string; name: string; size_label: string; description: string | null; walls: boolean };
export type RoomInfo = {
  id: string; name: string; size: number; sizeLabel: string | null; perimeter: number | null; height: number | null; openings: number;
  perimeterEstimated: boolean; heightAssumed: boolean; source: string; walls: boolean;
};

const perimeterOf = (area: number) => Math.round(5 * Math.sqrt(Math.max(area, 0) / 1.5) * 100) / 100;
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};
const isArea = (label: string | null | undefined) => !!label && /m²|m2/.test(label);

export function AddRoomForm({ projectId, versionId, templates, defaultHeight, onDone }: {
  projectId: string; versionId: string; templates: Template[]; defaultHeight: number; onDone: () => void;
}) {
  const [error, action, pending] = useActionState(addRoom.bind(null, projectId, versionId), null);
  useCloseOnSuccess(pending, error, onDone);
  const [selected, setSelected] = useState<string>("");
  const [size, setSize] = useState("");
  const [perimeter, setPerimeter] = useState("");
  const tpl = templates.find((t) => t.id === selected);
  const area = num(size);
  const geometry = !tpl || (tpl.walls && isArea(tpl.size_label));

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <p className="text-sm text-muted sm:col-span-2">
        Fills in the standard items for that room type: floors by area, skirting by perimeter, paint and tiling by wall area (perimeter × height
        − doors and windows). Take the figures from the model, a dimensioned sketch, or the site measurements.
      </p>
      <div>
        <label htmlFor="template_id" className="label">Room type</label>
        <select id="template_id" name="template_id" required autoFocus className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="" disabled>Choose…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="label" className="label">Name in the budget</label>
        <input id="label" name="label" className="input" placeholder={tpl?.name ?? "e.g. Bedroom 2"} />
      </div>
      <div>
        <label htmlFor="size" className="label">{tpl ? cap(tpl.size_label) : "Floor area (m²)"}</label>
        <input id="size" name="size" required inputMode="decimal" className="input" value={size} onChange={(e) => setSize(e.target.value)} />
      </div>
      {geometry && (
        <>
          <div>
            <label htmlFor="height" className="label">Height (m)</label>
            <input id="height" name="height" inputMode="decimal" className="input" placeholder={`${defaultHeight.toFixed(2)} if empty`} />
          </div>
          <div>
            <label htmlFor="perimeter" className="label">Perimeter (m)</label>
            <input id="perimeter" name="perimeter" inputMode="decimal" className="input" value={perimeter} onChange={(e) => setPerimeter(e.target.value)}
              placeholder={area ? `≈ ${perimeterOf(area).toFixed(2)} if empty` : "Estimated if empty"} />
          </div>
          <div>
            <label htmlFor="openings" className="label">Doors and windows (m²)</label>
            <input id="openings" name="openings" inputMode="decimal" className="input" placeholder="0" />
          </div>
          {!perimeter && area ? (
            <p className="text-xs text-muted sm:col-span-2">
              No perimeter: estimated as a 1:1.5 rectangle ({perimeterOf(area).toFixed(2)} m) and marked as an estimate until you measure it.
            </p>
          ) : null}
        </>
      )}
      {tpl?.description && <p className="text-xs text-muted sm:col-span-2">{tpl.description}</p>}
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Adding…" : "Add room"}</button>
      </div>
    </form>
  );
}

export function EditRoomForm({ projectId, versionId, room, onDone }: { projectId: string; versionId: string; room: RoomInfo; onDone: () => void }) {
  const [error, action, pending] = useActionState(updateRoom.bind(null, projectId, versionId), null);
  const [delError, del, deleting] = useActionState(deleteRoom.bind(null, projectId, versionId), null);
  useCloseOnSuccess(pending, error, onDone);
  useCloseOnSuccess(deleting, delError, onDone);
  const [asking, setAsking] = useState(false);
  const geometry = room.walls || room.perimeter != null;

  return (
    <div className="space-y-5">
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="room_id" value={room.id} />
        <div>
          <label htmlFor="r-name" className="label">Name</label>
          <input id="r-name" name="name" className="input" defaultValue={room.name} required />
        </div>
        <div>
          <label htmlFor="r-size" className="label">{room.sizeLabel ? cap(room.sizeLabel) : "Size"}</label>
          <input id="r-size" name="size" inputMode="decimal" className="input" defaultValue={room.size} />
        </div>
        {geometry && (
          <>
            <div>
              <label htmlFor="r-height" className="label">Height (m){room.heightAssumed ? " · default" : ""}</label>
              <input id="r-height" name="height" inputMode="decimal" className="input" defaultValue={room.heightAssumed ? "" : (room.height ?? "")}
                placeholder={room.height != null ? `${room.height.toFixed(2)} (default)` : ""} />
            </div>
            <div>
              <label htmlFor="r-perimeter" className="label">Perimeter (m){room.perimeterEstimated ? " · estimated" : ""}</label>
              <input id="r-perimeter" name="perimeter" inputMode="decimal" className="input"
                defaultValue={room.perimeterEstimated ? "" : (room.perimeter ?? "")}
                placeholder={room.perimeterEstimated && room.perimeter != null ? `≈ ${room.perimeter} (estimate)` : "Estimated if empty"} />
              <input type="hidden" name="estimate" value="on" />
            </div>
            <div>
              <label htmlFor="r-openings" className="label">Doors and windows (m²)</label>
              <input id="r-openings" name="openings" inputMode="decimal" className="input" defaultValue={room.openings} />
            </div>
          </>
        )}
        <p className="text-xs text-muted sm:col-span-2">
          Lines from the room&apos;s template are recalculated. Lines you edited by hand keep their quantities.
        </p>
        {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
          <button type="submit" disabled={pending} className="btn">{pending ? "Saving…" : "Save and recalculate"}</button>
        </div>
      </form>
      <form action={del} className="flex items-center gap-3 border-t border-line pt-4">
        <input type="hidden" name="room_id" value={room.id} />
        {asking ? (
          <>
            <button className="btn" disabled={deleting}>{deleting ? "Removing…" : "Remove room and its lines"}</button>
            <button type="button" className="btn-quiet" onClick={() => setAsking(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="btn-quiet" onClick={() => setAsking(true)}>Remove room…</button>
        )}
        {delError && <span className="text-sm text-accent">{delError}</span>}
      </form>
    </div>
  );
}

/** "12 m² · perimeter 14 m (est.) · h 2.60 m" */
export function roomSummary(r: RoomInfo) {
  const parts = [`${fmt(r.size)} ${r.sizeLabel && isArea(r.sizeLabel) ? "m²" : r.sizeLabel ?? ""}`.trim()];
  if (r.perimeter != null) parts.push(`perimeter ${fmt(r.perimeter)} m${r.perimeterEstimated ? " (est.)" : ""}`);
  if (r.height != null && (r.walls || r.perimeter != null)) parts.push(`h ${r.height.toFixed(2)} m${r.heightAssumed ? " (default)" : ""}`);
  if (r.openings) parts.push(`openings ${fmt(r.openings)} m²`);
  return parts.join(" · ");
}

const fmt = (n: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n);

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
