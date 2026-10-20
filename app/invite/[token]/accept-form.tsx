"use client";

import { useActionState } from "react";
import { accept } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, run, pending] = useActionState(accept, null);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <button className="btn w-full" disabled={pending}>{pending ? "Joining…" : "Join the studio"}</button>
      {state?.error && <p className="text-sm text-accent">{state.error}</p>}
    </form>
  );
}
