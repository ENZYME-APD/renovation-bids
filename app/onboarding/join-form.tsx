"use client";

import { useActionState } from "react";
import { joinStudio } from "./actions";

export function JoinForm({ id, name }: { id: string; name: string }) {
  const [error, action, pending] = useActionState(joinStudio, null);
  return (
    <form action={action} className="card flex items-center justify-between gap-3 p-4">
      <input type="hidden" name="org_id" value={id} />
      <span className="font-medium">{name}</span>
      <button className="btn" disabled={pending}>{pending ? "Joining…" : "Join"}</button>
      {error && <p className="w-full text-sm text-accent">{error}</p>}
    </form>
  );
}
