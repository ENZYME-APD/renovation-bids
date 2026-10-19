import { redirect } from "next/navigation";
import { getStudio, getUser } from "@/lib/dal";
import { StudioForm } from "./studio-form";

export default async function OnboardingPage() {
  const user = await getUser();
  if (await getStudio()) redirect("/projects");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Welcome</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set up your studio</h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          Signed in as {user.email}. You’ll be the studio’s owner and can invite your team later.
        </p>
        <StudioForm />
      </div>
    </main>
  );
}
