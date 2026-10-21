import { redirect } from "next/navigation";
import { getStudio, getUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { StudioForm } from "./studio-form";
import { JoinForm } from "./join-form";

export default async function OnboardingPage() {
  const user = await getUser();
  if (await getStudio()) redirect("/dashboard");
  const supabase = await createClient();
  const { data: joinable } = await supabase.rpc("joinable_studios");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Welcome</p>
        {joinable?.length ? (
          <>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Join your studio</h1>
            <p className="mt-2 mb-6 text-sm text-muted">
              Signed in as {user.email}. Your company already has a studio here: join it as a member. An admin can change your role later.
            </p>
            <div className="space-y-3">
              {joinable.map((s) => <JoinForm key={s.id} id={s.id} name={s.name} />)}
            </div>
            <details className="mt-10 text-sm">
              <summary className="cursor-pointer text-muted">Create a separate studio instead</summary>
              <div className="mt-4"><StudioForm /></div>
            </details>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set up your studio</h1>
            <p className="mt-2 mb-8 text-sm text-muted">
              Signed in as {user.email}. You’ll be the studio’s owner and can invite your team later. Joining an existing studio? Open the
              invitation link you were sent, or ask an admin to set your company&apos;s email domain in Settings → Studio.
            </p>
            <StudioForm />
          </>
        )}
      </div>
    </main>
  );
}
