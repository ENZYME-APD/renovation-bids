import Link from "next/link";
import { notFound } from "next/navigation";
import { wikiPage } from "@/lib/wiki";
import { WikiMarkdown } from "@/components/wiki-markdown";

export default async function WikiArticle({ params }: PageProps<"/wiki/[slug]">) {
  const { slug } = await params;
  const found = await wikiPage(slug);
  if (!found) notFound();
  const { page, prev, next } = found;
  return (
    <article>
      <p className="eyebrow">{page.section}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{page.title}</h1>
      <WikiMarkdown source={page.body} />
      <nav className="mt-12 flex max-w-3xl justify-between gap-4 border-t border-line pt-4 text-sm">
        {prev ? <Link href={`/wiki/${prev.slug}`} className="text-muted hover:text-ink">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/wiki/${next.slug}`} className="text-right text-muted hover:text-ink">{next.title} →</Link> : <span />}
      </nav>
    </article>
  );
}
