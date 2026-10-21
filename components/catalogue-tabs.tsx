import Link from "next/link";

/** Partidas | Room templates, at the top of both catalogue pages. */
export function CatalogueTabs({ active }: { active: "partidas" | "templates" }) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link
      href={href}
      className={`border-b-2 px-1 pb-2 text-sm ${active === key ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mt-4 flex gap-5 border-b border-line">
      {tab("partidas", "/catalogue", "Partidas and prices")}
      {tab("templates", "/catalogue/templates", "Room templates")}
    </nav>
  );
}
