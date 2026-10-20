import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStudio, getUser } from "@/lib/dal";
import { decide } from "./actions";

// Supabase Auth (OAuth 2.1 server) sends the user here to approve an AI assistant's access.
// Authentication → OAuth Server → Authorization path must be /oauth/consent.
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const sp = await searchParams;
  const authorizationId = typeof sp.authorization_id === "string" ? sp.authorization_id : "";
  const user = await getUser();
  const supabase = await createClient();

  if (!authorizationId) return <Shell title="Nothing to approve"><p className="text-sm text-muted">This link is missing its authorization request. Start the connection again from your assistant.</p></Shell>;

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Shell title="Request not found"><p className="text-sm text-muted">{error?.message ?? "It may have expired."} Start the connection again from your assistant.</p></Shell>;
  if ("redirect_url" in data && !("authorization_id" in data)) redirect(data.redirect_url);
  const details = data as Extract<typeof data, { authorization_id: string }>;

  const studio = await getStudio();
  const allowed =
    !!studio &&
    (studio.aiConnect === "everyone" || (studio.aiConnect === "members" && studio.role !== "viewer") || (studio.aiConnect === "admins" && studio.isAdmin));
  const canChange = !!studio && studio.canWrite && (studio.isAdmin || studio.aiChanges === "members");

  return (
    <Shell title={`Connect ${details.client.name || "an assistant"}`}>
      <p className="mb-4 text-sm text-muted">
        {details.client.name || "This app"} wants to use Renovation Bids as {user.email}
        {studio ? <> in {studio.name}</> : null}.
      </p>
      {typeof sp.error === "string" && <p className="mb-4 text-sm text-accent">{sp.error}</p>}
      {!studio ? (
        <p className="mb-6 text-sm">You don’t belong to a studio yet, so there is nothing to connect.</p>
      ) : !allowed ? (
        <p className="mb-6 text-sm">Your studio’s AI access rules don’t let your role connect an assistant. Ask an owner or admin (Settings → AI access).</p>
      ) : (
        <ul className="mb-6 list-disc space-y-1 pl-5 text-sm">
          <li>See your studio’s projects, budgets, catalogue, suppliers and purchasing, as your role ({studio.role}) allows.</li>
          <li>{canChange ? "Make changes after asking you first. Every change is logged and can be undone in Settings → Activity." : "Read only: your role or your studio’s rules don’t allow the assistant to make changes."}</li>
        </ul>
      )}
      <form action={decide} className="flex gap-3">
        <input type="hidden" name="authorization_id" value={details.authorization_id} />
        {allowed && <button className="btn" name="decision" value="approve">Allow</button>}
        <button className="btn-quiet" name="decision" value="deny">{allowed ? "Cancel" : "Close"}</button>
      </form>
      {details.redirect_uri && <p className="mt-6 text-xs text-muted">You’ll be sent back to {new URL(details.redirect_uri).host}.</p>}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <p className="eyebrow">Renovation Bids · AI access</p>
        <h1 className="mt-2 mb-4 text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}
