import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUser, requireStudio, type Role } from "@/lib/dal";
import { dateTime } from "@/lib/format";
import { describe, groupChanges, sourceLabel, type ActivityRow } from "@/lib/activity";
import { CopyBox } from "@/components/copy-box";
import { AiRulesForm, InviteForm, PasswordForm, ProfileForm, StudioForm, UndoButton } from "./forms";
import { changeRole, removeMember, revokeAppAccess, revokeInvitation } from "./actions";

const TABS = [
  ["profile", "Profile"],
  ["studio", "Studio"],
  ["team", "Team"],
  ["ai", "AI access"],
  ["activity", "Activity"],
] as const;
type Tab = (typeof TABS)[number][0];

const ROLES: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "profile") as Tab;
  const studio = await requireStudio();
  const user = await getUser();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{studio.name}</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <PageIntro wiki="settings-and-roles">Your profile, the studio&apos;s defaults, the team and their roles, AI access, and the log of every change with undo.</PageIntro>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/settings?tab=${k}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${k === tab ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "profile" && <ProfileTab userId={user.id} email={user.email} resetting={sp.password === "1"} />}
      {tab === "studio" && (
        <section className="card space-y-4">
          {!studio.isAdmin && <p className="text-sm text-muted">Only owners and admins can change studio settings.</p>}
          <StudioForm
            name={studio.name}
            currency={studio.currency}
            language={studio.language}
            contingency={studio.contingencyPct}
            vat={studio.vatPct}
            allowBidOptions={studio.allowBidOptions}
            roomHeight={studio.defaultRoomHeight}
            emailDomain={studio.emailDomain}
            myDomain={user.email.split("@")[1] ?? ""}
            disabled={!studio.isAdmin}
          />
        </section>
      )}
      {tab === "team" && <TeamTab studioId={studio.id} isAdmin={studio.isAdmin} me={user.id} myRole={studio.role} />}
      {tab === "ai" && <AiTab studio={studio} />}
      {tab === "activity" && <ActivityTab canWrite={studio.canWrite} isAdmin={studio.isAdmin} me={user.id} />}
    </div>
  );
}

async function ProfileTab({ userId, email, resetting }: { userId: string; email: string; resetting: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name, language").eq("user_id", userId).maybeSingle();
  return (
    <section className="card space-y-4">
      <ProfileForm email={email} displayName={data?.display_name ?? ""} language={data?.language ?? ""} />
      <div className="border-t border-line pt-4">
        <PasswordForm highlight={resetting} />
      </div>
      <form action="/auth/signout" method="post">
        <button className="btn-quiet">Sign out</button>
      </form>
    </section>
  );
}

async function TeamTab({ studioId, isAdmin, me, myRole }: { studioId: string; isAdmin: boolean; me: string; myRole: Role }) {
  const supabase = await createClient();
  const [{ data: members }, { data: profiles }, { data: invites }] = await Promise.all([
    supabase.from("members").select("user_id, role, created_at").eq("organization_id", studioId).order("created_at"),
    supabase.from("profiles").select("user_id, email, display_name"),
    isAdmin
      ? supabase.from("invitations").select("id, email, role, token, expires_at, accepted_at").eq("organization_id", studioId).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: Role; token: string; expires_at: string; accepted_at: string | null }[] }),
  ]);
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const base = await siteUrl();
  const assignable: Role[] = myRole === "owner" ? ["owner", "admin", "member", "viewer"] : ["admin", "member", "viewer"];

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 font-semibold">Members</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr><th className="py-2">Person</th><th>Role</th><th /></tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => {
              const p = byId.get(m.user_id);
              const editable = isAdmin && m.user_id !== me && (m.role !== "owner" || myRole === "owner");
              return (
                <tr key={m.user_id} className="border-t border-line">
                  <td className="py-2">
                    {p?.display_name || p?.email || m.user_id}
                    {p?.display_name && <span className="ml-2 text-muted">{p.email}</span>}
                    {m.user_id === me && <span className="ml-2 text-muted">(you)</span>}
                  </td>
                  <td>
                    {editable ? (
                      <form action={changeRole} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <select name="role" defaultValue={m.role} className="input py-1">
                          {assignable.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                        </select>
                        <button className="btn-quiet">Change</button>
                      </form>
                    ) : (
                      ROLES[m.role]
                    )}
                  </td>
                  <td className="text-right">
                    {editable && (
                      <form action={removeMember}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <button className="btn-quiet">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted">
          Owners and admins manage the studio and team. Members price and edit projects. Viewers see everything and change nothing.
        </p>
      </section>

      {isAdmin && (
        <section className="card space-y-4">
          <h2 className="font-semibold">Invite someone</h2>
          <InviteForm />
          {(invites ?? []).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Pending invitations</h3>
              {(invites ?? []).map((i) => (
                <div key={i.id} className="space-y-2 border-t border-line pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{i.email} · {ROLES[i.role]} · expires {dateTime(i.expires_at)}</span>
                    <form action={revokeInvitation}>
                      <input type="hidden" name="id" value={i.id} />
                      <button className="btn-quiet">Revoke</button>
                    </form>
                  </div>
                  <CopyBox label="Invitation link (they sign in with this email)" value={`${base}/invite/${i.token}`} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

async function AiTab({ studio }: { studio: Awaited<ReturnType<typeof requireStudio>> }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .eq("source", "ai")
    .order("occurred_at", { ascending: false })
    .limit(100);
  const changes = groupChanges((data ?? []) as ActivityRow[]).slice(0, 15);
  const base = await siteUrl();
  // Apps this user approved. Fails quietly until the OAuth server is enabled in Supabase.
  const { data: grants } = await supabase.auth.oauth.listGrants().catch(() => ({ data: null }));
  const connectOk =
    studio.aiConnect === "everyone" ||
    (studio.aiConnect === "members" && studio.role !== "viewer") ||
    (studio.aiConnect === "admins" && studio.isAdmin);

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-semibold">Connect an assistant</h2>
        <p className="text-sm text-muted">
          Add this address as a custom connector in Claude (Settings → Connectors → Add custom connector). You sign in with your
          studio account; the assistant then sees and does only what your role allows, and asks before changing anything.
        </p>
        <CopyBox label="Server address" value={`${base}/api/mcp`} />
        <p className="text-sm">
          {connectOk ? "You can connect an assistant." : "Your studio's rules don't let your role connect an assistant."}
        </p>
      </section>
      <section className="card">
        <h2 className="mb-3 font-semibold">Your connected apps</h2>
        {grants?.length ? (
          <ul className="divide-y divide-line">
            {grants.map((g) => (
              <li key={g.client.id} className="flex items-center justify-between py-2 text-sm">
                <span>{g.client.name || g.client.id} <span className="text-muted">· since {dateTime(g.granted_at)}</span></span>
                <form action={revokeAppAccess}>
                  <input type="hidden" name="client_id" value={g.client.id} />
                  <button className="btn-quiet">Disconnect</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None yet.</p>
        )}
      </section>
      <section className="card space-y-4">
        <h2 className="font-semibold">Rules</h2>
        <AiRulesForm connect={studio.aiConnect} changes={studio.aiChanges} disabled={!studio.isAdmin} />
      </section>
      <section className="card">
        <h2 className="mb-3 font-semibold">Recent changes by assistants</h2>
        <ChangeList changes={changes} canUndo={studio.canWrite} />
      </section>
    </div>
  );
}

async function ActivityTab({ canWrite, isAdmin, me }: { canWrite: boolean; isAdmin: boolean; me: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("activity_log").select("*").order("occurred_at", { ascending: false }).limit(300);
  const changes = groupChanges((data ?? []) as ActivityRow[]).slice(0, 60);
  return (
    <section className="card">
      <h2 className="mb-1 font-semibold">Activity</h2>
      <p className="mb-4 text-sm text-muted">Every change in the studio, who made it and from where. You can undo your own changes; admins can undo anyone&apos;s.</p>
      <ChangeList changes={changes} canUndo={canWrite} isAdmin={isAdmin} me={me} />
    </section>
  );
}

function ChangeList({
  changes, canUndo, isAdmin = true, me,
}: { changes: ReturnType<typeof groupChanges>; canUndo: boolean; isAdmin?: boolean; me?: string }) {
  if (!changes.length) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {changes.map((c) => {
        const mayUndo = canUndo && !c.undone && !c.isUndo && (isAdmin || c.actorId === me);
        return (
          <li key={c.changeId} className="flex items-start justify-between gap-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="text-muted">
                {dateTime(c.at)} · {c.actor ?? "System"} · {sourceLabel(c)}
                {c.undone && <span className="ml-2 text-accent">undone</span>}
                {c.isUndo && <span className="ml-2">undo</span>}
              </div>
              <ul className={c.undone ? "line-through opacity-60" : ""}>
                {c.items.slice(0, 5).map((i) => <li key={i.id} className="truncate">{describe(i)}</li>)}
                {c.items.length > 5 && <li className="text-muted">and {c.items.length - 5} more</li>}
              </ul>
            </div>
            {mayUndo && <UndoButton changeId={c.changeId} />}
          </li>
        );
      })}
    </ul>
  );
}
