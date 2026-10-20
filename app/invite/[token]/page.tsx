import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/dal";
import { AcceptForm } from "./accept-form";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const inv = data?.[0];

  let body: React.ReactNode;
  if (!inv) body = <p className="text-sm text-muted">This invitation doesn’t exist or was revoked. Ask for a new link.</p>;
  else if (inv.accepted) body = <p className="text-sm text-muted">This invitation has already been used.</p>;
  else if (inv.expired) body = <p className="text-sm text-muted">This invitation has expired. Ask for a new link.</p>;
  else if (inv.email.toLowerCase() !== user.email.toLowerCase())
    body = (
      <div className="text-sm text-muted">
        This invitation is for {inv.email}, but you’re signed in as {user.email}. Sign out and sign in with the invited email.
        <form action="/auth/signout" method="post" className="mt-4"><button className="btn-quiet">Sign out</button></form>
      </div>
    );
  else
    body = (
      <>
        <p className="mb-6 text-sm text-muted">You’ll join as {inv.role}. Signed in as {user.email}.</p>
        <AcceptForm token={token} />
      </>
    );

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Invitation</p>
        <h1 className="mt-2 mb-4 text-2xl font-semibold tracking-tight">{inv ? `Join ${inv.studio}` : "Invitation"}</h1>
        {body}
      </div>
    </main>
  );
}
