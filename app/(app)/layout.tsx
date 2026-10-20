import Link from "next/link";
import { requireStudio, getUser } from "@/lib/dal";
import { humanize } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [studio, user] = await Promise.all([requireStudio(), getUser()]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Renovation bids
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-ink">{n.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted md:inline">
              {studio.name} · {user.email} · {humanize(studio.role)}
            </span>
            <form action="/auth/signout" method="post">
              <button className="btn-quiet">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {!studio.canWrite && (
        <div className="border-b border-line bg-surface px-4 py-2 text-center text-xs text-muted">
          You have view-only access to {studio.name}.
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
