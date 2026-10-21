import Link from "next/link";
import { wikiPages } from "@/lib/wiki";

export default async function WikiIndex() {
  const pages = await wikiPages();
  const sections = [...new Set(pages.map((p) => p.section))];
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Wiki</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          How the platform works: the bid workflow, the catalogue and pricing method, budgets, purchasing, the AI assistant and the
          architecture behind it. Each page has diagrams and worked examples.
        </p>
      </header>
      {sections.map((s) => (
        <section key={s}>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">{s}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {pages.filter((p) => p.section === s).map((p) => (
              <Link key={p.slug} href={`/wiki/${p.slug}`} className="card block p-4 hover:border-accent">
                <div className="font-medium">{p.title}</div>
                {p.summary && <div className="mt-1 text-sm text-muted">{p.summary}</div>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
