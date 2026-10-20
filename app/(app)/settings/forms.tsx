"use client";

import { ActionForm } from "@/components/action-form";
import { saveAiRules, saveProfile, saveStudio, invite, undoChange } from "./actions";

const CURRENCIES = ["EUR", "GBP", "USD", "CHF", "MXN", "COP", "CLP", "ARS"];

export function ProfileForm({ displayName, language, email }: { displayName: string; language: string; email: string }) {
  return (
    <ActionForm action={saveProfile} submit="Save profile" className="grid max-w-md gap-4">
      <label>
        <span className="label">Email</span>
        <input className="input" value={email} disabled />
      </label>
      <label>
        <span className="label">Name</span>
        <input className="input" name="display_name" defaultValue={displayName} placeholder="How the team sees you" />
      </label>
      <label>
        <span className="label">Your language</span>
        <select className="input" name="language" defaultValue={language}>
          <option value="">Same as the studio</option>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </label>
    </ActionForm>
  );
}

export function StudioForm(p: {
  name: string; currency: string; language: string; contingency: number; vat: number; disabled: boolean;
}) {
  return (
    <ActionForm action={saveStudio} submit="Save studio" className="grid max-w-md gap-4" disabled={p.disabled}>
      <fieldset disabled={p.disabled} className="grid gap-4">
        <label>
          <span className="label">Studio name</span>
          <input className="input" name="name" defaultValue={p.name} required />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label>
            <span className="label">Currency</span>
            <select className="input" name="currency" defaultValue={p.currency}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Language of offers</span>
            <select className="input" name="language" defaultValue={p.language}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <span className="label">Default contingency %</span>
            <input className="input" name="contingency" type="number" step="0.5" min="0" defaultValue={p.contingency} />
          </label>
          <label>
            <span className="label">Default VAT %</span>
            <input className="input" name="vat" type="number" step="0.5" min="0" defaultValue={p.vat} />
          </label>
        </div>
        <p className="text-sm text-muted">Defaults apply to new versions. Reformas de vivienda usually take 10% VAT; commercial premises 21%.</p>
      </fieldset>
    </ActionForm>
  );
}

const CONNECT = [
  ["none", "Nobody"],
  ["admins", "Owners and admins"],
  ["members", "Owners, admins and members"],
  ["everyone", "Everyone, including viewers (read only)"],
] as const;

export function AiRulesForm({ connect, changes, disabled }: { connect: string; changes: string; disabled: boolean }) {
  return (
    <ActionForm action={saveAiRules} submit="Save rules" className="grid max-w-md gap-4" disabled={disabled}>
      <fieldset disabled={disabled} className="grid gap-4">
        <label>
          <span className="label">Who can connect an AI assistant</span>
          <select className="input" name="ai_connect" defaultValue={connect}>
            {CONNECT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Who can let it make changes</span>
          <select className="input" name="ai_changes" defaultValue={changes}>
            <option value="admins">Owners and admins</option>
            <option value="members">Owners, admins and members</option>
          </select>
        </label>
        <p className="text-sm text-muted">Others who connect can only read. Viewers can never make changes.</p>
      </fieldset>
    </ActionForm>
  );
}

export function InviteForm() {
  return (
    <ActionForm action={invite} submit="Create invitation" className="flex flex-wrap items-end gap-3">
      <label className="min-w-56 flex-1">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" required placeholder="colleague@studio.com" />
      </label>
      <label>
        <span className="label">Role</span>
        <select className="input" name="role" defaultValue="member">
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
    </ActionForm>
  );
}

export function UndoButton({ changeId }: { changeId: string }) {
  return (
    <ActionForm action={undoChange} submit="Undo" quiet>
      <input type="hidden" name="change_id" value={changeId} />
    </ActionForm>
  );
}
