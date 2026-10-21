import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Wiki pages are Markdown files in content/wiki, named NN-slug.md (NN sets the order).
// The first line is "# Title"; an optional "> summary" line follows it.
const DIR = path.join(process.cwd(), "content", "wiki");

export type WikiPage = { slug: string; title: string; summary: string; section: string; body: string };

export async function wikiPages(): Promise<WikiPage[]> {
  const files = (await readdir(DIR)).filter((f) => /^\d+-[a-z0-9-]+\.md$/.test(f)).sort();
  return Promise.all(
    files.map(async (f) => {
      const raw = await readFile(path.join(DIR, f), "utf8");
      const lines = raw.split("\n");
      const title = (lines.find((l) => l.startsWith("# ")) ?? f).replace(/^# /, "").trim();
      const summary = (lines.find((l) => l.startsWith("> ")) ?? "").replace(/^> /, "").trim();
      const section = (raw.match(/^<!-- section: (.+?) -->/m)?.[1] ?? "Guide").trim();
      const body = lines.filter((l) => !l.startsWith("# ") && !l.startsWith("<!-- section:")).join("\n").trim();
      return { slug: f.replace(/^\d+-/, "").replace(/\.md$/, ""), title, summary, section, body };
    }),
  );
}

export async function wikiPage(slug: string) {
  const pages = await wikiPages();
  const i = pages.findIndex((p) => p.slug === slug);
  return i < 0 ? null : { page: pages[i], prev: pages[i - 1] ?? null, next: pages[i + 1] ?? null, pages };
}
