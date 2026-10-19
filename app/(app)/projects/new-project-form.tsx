"use client";

import { useActionState } from "react";
import { createProject } from "./actions";

export function NewProjectForm() {
  const [error, action, pending] = useActionState(createProject, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="name" className="label">Project name</label>
        <input id="name" name="name" required className="input" placeholder="Piso Chamberí, 3º B" />
      </div>
      <div>
        <label htmlFor="client" className="label">Client</label>
        <input id="client" name="client" className="input" placeholder="Name of the owner" />
      </div>
      <div>
        <label htmlFor="district" className="label">District</label>
        <input id="district" name="district" className="input" placeholder="Chamberí" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="address" className="label">Address</label>
        <input id="address" name="address" className="input" />
      </div>
      <div>
        <label htmlFor="area" className="label">Area (m²)</label>
        <input id="area" name="area" inputMode="decimal" className="input" />
      </div>
      <div>
        <label htmlFor="year" className="label">Year built</label>
        <input id="year" name="year" inputMode="numeric" className="input" placeholder="1965" />
      </div>
      <div>
        <label htmlFor="budget" className="label">Client’s stated budget (€)</label>
        <input id="budget" name="budget" inputMode="decimal" className="input" />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className="btn w-full">
          {pending ? "Creating…" : "Create project"}
        </button>
      </div>
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
    </form>
  );
}
