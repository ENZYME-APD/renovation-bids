import Link from "next/link";
import { requireStudio, getUser } from "@/lib/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [studio, user] = await Promise.all([requireStudio(), getUser()]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/projects" className="font-semibold tracking-tight">
              Renovation bids
            </Link>
            <nav className="text-sm text-muted">
              <Link href="/projects" className="hover:text-ink">Projects</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{studio.name} · {user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="btn-quiet">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
