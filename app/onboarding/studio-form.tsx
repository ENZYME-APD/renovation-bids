"use client";

import { useActionState } from "react";
import { createStudio } from "./actions";

export function StudioForm() {
  const [error, action, pending] = useActionState(createStudio, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="label">Studio name</label>
        <input id="name" name="name" required className="input" placeholder="Enzyme" />
      </div>
      <div>
        <span className="label">Market</span>
        <p className="text-sm">Spain — partidas, IVA and permit rules for Spain</p>
      </div>
      {error && <p className="text-sm text-accent">{error}</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Creating…" : "Create studio"}
      </button>
    </form>
  );
}
