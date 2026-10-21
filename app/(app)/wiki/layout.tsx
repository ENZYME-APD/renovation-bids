import Link from "next/link";
import { wikiPages } from "@/lib/wiki";

export default async function WikiLayout({ children }: LayoutProps<"/wiki">) {
  const pages = await wikiPages();
  const sections = [...new Set(pages.map((p) => p.section))];
  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Link href="/wiki" className="eyebrow">Wiki</Link>
        <nav className="mt-3 space-y-5 text-sm">
          {sections.map((s) => (
            <div key={s}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">{s}</p>
              <ul className="space-y-0.5">
                {pages.filter((p) => p.section === s).map((p) => (
                  <li key={p.slug}>
                    <Link href={`/wiki/${p.slug}`} className="block rounded px-2 py-1 text-ink/80 hover:bg-surface hover:text-ink">{p.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
