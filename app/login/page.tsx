import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Renovation bids</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 mb-8 text-sm text-muted">With Google, your password, or a link by email.</p>
        <LoginForm error={typeof error === "string" ? error : undefined} />
      </div>
    </main>
  );
}
