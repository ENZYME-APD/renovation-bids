import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { Mermaid } from "./mermaid";

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const text = (n: React.ReactNode): string => (typeof n === "string" ? n : Array.isArray(n) ? n.map(text).join("") : "");

/** Markdown for wiki pages: GitHub tables, mermaid code blocks as diagrams, internal links. */
export function WikiMarkdown({ source }: { source: string }) {
  return (
    <div className="wiki">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugify(text(children))}>{children}</h3>,
          a: ({ href = "", children }) =>
            href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") return <Mermaid chart={String(children).trim()} />;
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => {
            // A mermaid block renders as a figure, not inside <pre>.
            const child = Array.isArray(children) ? children[0] : children;
            const cls = (child as { props?: { className?: string } })?.props?.className ?? "";
            return cls.includes("language-mermaid") ? <>{children}</> : <pre>{children}</pre>;
          },
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border border-line">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
