"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: error ? "error" : "idle",
    message: error,
  });

  if (state.status === "sent") {
    return <p className="text-sm text-ok">{state.message}</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@studio.com" />
      </div>
      {state.status === "error" && <p className="text-sm text-accent">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
