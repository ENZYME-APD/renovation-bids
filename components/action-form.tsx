"use client";

import { useActionState, type ReactNode } from "react";

type State = { ok?: string; error?: string } | null;

/** A form bound to a server action that returns { ok } or { error }, with the message shown inline. */
export function ActionForm({
  action,
  children,
  submit,
  className,
  disabled,
  quiet,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children?: ReactNode;
  submit: string;
  className?: string;
  disabled?: boolean;
  quiet?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || disabled} className={quiet ? "btn-quiet" : "btn"}>
          {pending ? "Working…" : submit}
        </button>
        {state?.ok && <span className="text-sm text-ok">{state.ok}</span>}
        {state?.error && <span className="text-sm text-accent">{state.error}</span>}
      </div>
    </form>
  );
}
